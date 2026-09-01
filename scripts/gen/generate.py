"""Renders the Countersign seed invoices: PDF -> PNG + extraction JSON (CLAUDE.md §14).

Bounding boxes are recorded at draw time as page fractions [x0, y0, x1, y1],
origin top-left. Output is byte-for-byte deterministic.

Usage: python scripts/gen/generate.py
"""

from __future__ import annotations

import datetime as dt
import json
import zlib
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas

from templates import (
    BILL_TO,
    DPI,
    GL_CODES,
    INVOICES,
    PAGE_H,
    PAGE_W,
    POS,
    RECEIPTS,
    TERMS_DAYS,
    VENDOR_DOC,
    VENDORS,
)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "scripts" / "gen" / "out"
ASSETS = OUT / "assets"
DATA = ROOT / "data"
PUBLIC = ROOT / "public" / "invoices"

WINDOWS_FONTS = Path("C:/Windows/Fonts")
LOGO_PX = (300, 90)
LOGO_PT = (LOGO_PX[0] / DPI * 72, LOGO_PX[1] / DPI * 72)
STAMP_WIDTH_PT = 200.0
STAMP_ALPHA = int(round(0.55 * 255))
STAMP_RED = (186, 24, 24, STAMP_ALPHA)

FONTS = {
    "A": {"regular": "Helvetica", "bold": "Helvetica-Bold", "italic": "Helvetica-Oblique"},
    "B": {"regular": "Times-Roman", "bold": "Times-Bold", "italic": "Times-Italic"},
}

INK = colors.Color(0.12, 0.12, 0.14)
MUTED = colors.Color(0.42, 0.42, 0.46)
RULE = colors.Color(0.72, 0.72, 0.75)
BAND = colors.Color(0.92, 0.92, 0.93)


# ---------------------------------------------------------------- helpers


def money(x: float) -> str:
    return f"${x:,.2f}"


def confidence(inv_id: str, field: str) -> float:
    return round(0.93 + (zlib.crc32((inv_id + field).encode()) % 700) / 10000, 4)


def iso_plus(date: str, days: int) -> str:
    return (dt.date.fromisoformat(date) + dt.timedelta(days=days)).isoformat()


def pil_font(name: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = WINDOWS_FONTS / name
    if path.exists():
        return ImageFont.truetype(str(path), size)
    try:
        return ImageFont.truetype(name, size)
    except OSError:
        return ImageFont.load_default(size=size)


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- raster assets


def make_logo(vendor_id: str) -> Path:
    doc = VENDOR_DOC[vendor_id]
    path = ASSETS / f"logo_{vendor_id}.jpg"
    img = Image.new("RGB", LOGO_PX, doc["color"])
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, LOGO_PX[1] - 8, LOGO_PX[0], LOGO_PX[1]], fill=(235, 235, 235))
    draw.text((LOGO_PX[0] / 2, LOGO_PX[1] / 2 - 4), doc["initials"], font=pil_font("arialbd.ttf", 58), fill=(255, 255, 255), anchor="mm")
    img.save(path, "JPEG", quality=55)
    return path


def make_stamp(inv_id: str, date: str) -> Path:
    path = ASSETS / f"stamp_{inv_id}.png"
    w, h = 560, 210
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([6, 6, w - 7, h - 7], radius=18, outline=STAMP_RED, width=9)
    draw.text((w / 2, 78), "RECEIVED", font=pil_font("arialbd.ttf", 82), fill=STAMP_RED, anchor="mm")
    draw.text((w / 2, 158), date, font=pil_font("arial.ttf", 40), fill=STAMP_RED, anchor="mm")
    img = img.rotate(12, expand=True, resample=Image.BICUBIC)
    img.save(path, "PNG")
    return path


# ---------------------------------------------------------------- page renderer


class Page:
    """Thin wrapper over a reportlab canvas that records bboxes for keyed text.

    All y coordinates passed in are measured from the TOP of the page (baseline
    distance from top) so the layout reads top-down like the JSON does.
    """

    def __init__(self, c: canvas.Canvas):
        self.c = c
        self.boxes: dict[str, list[float]] = {}
        self.boxes_pt: dict[str, tuple[float, float, float, float]] = {}

    def text(self, s: str, x: float, top: float, font: str, size: float, *, align: str = "left", key: str | None = None, color=INK) -> float:
        baseline = PAGE_H - top
        self.c.setFont(font, size)
        self.c.setFillColor(color)
        w = pdfmetrics.stringWidth(s, font, size)
        if align == "right":
            self.c.drawRightString(x, baseline, s)
            x0, x1 = x - w, x
        else:
            self.c.drawString(x, baseline, s)
            x0, x1 = x, x + w
        if key is not None:
            y_top = PAGE_H - (baseline + 0.8 * size)
            y_bottom = PAGE_H - (baseline - 0.25 * size)
            self.boxes_pt[key] = (x0, y_top, x1, y_bottom)
            self.boxes[key] = [round(x0 / PAGE_W, 4), round(y_top / PAGE_H, 4), round(x1 / PAGE_W, 4), round(y_bottom / PAGE_H, 4)]
        return x1

    def rect(self, x: float, top: float, w: float, h: float, *, fill=None, stroke=None, width: float = 0.6) -> None:
        if fill is not None:
            self.c.setFillColor(fill)
        if stroke is not None:
            self.c.setStrokeColor(stroke)
            self.c.setLineWidth(width)
        self.c.rect(x, PAGE_H - top - h, w, h, fill=fill is not None, stroke=stroke is not None)

    def hline(self, x0: float, x1: float, top: float, color=RULE, width: float = 0.6) -> None:
        self.c.setStrokeColor(color)
        self.c.setLineWidth(width)
        self.c.line(x0, PAGE_H - top, x1, PAGE_H - top)

    def vline(self, x: float, top0: float, top1: float, color=RULE, width: float = 0.6) -> None:
        self.c.setStrokeColor(color)
        self.c.setLineWidth(width)
        self.c.line(x, PAGE_H - top0, x, PAGE_H - top1)

    def image(self, path: Path, x: float, top: float, w: float, h: float, *, mask=None) -> None:
        self.c.drawImage(ImageReader(str(path)), x, PAGE_H - top - h, w, h, mask=mask)

    def stamp(self, path: Path, cx: float, ctop: float, width_pt: float = STAMP_WIDTH_PT) -> None:
        reader = ImageReader(str(path))
        iw, ih = reader.getSize()
        h = width_pt * ih / iw
        self.c.drawImage(reader, cx - width_pt / 2, PAGE_H - ctop - h / 2, width_pt, h, mask="auto")


# ---------------------------------------------------------------- invoice model


def build_invoice(spec: dict) -> dict:
    vendor = next(v for v in VENDORS if v["id"] == spec["vendor_id"])
    lines = []
    for n, ln in enumerate(spec["lines"], start=1):
        amount = round(ln["qty"] * ln["unit_price"], 2)
        lines.append({"line": n, **ln, "amount": amount})
    subtotal = round(sum(ln["amount"] for ln in lines), 2)
    tax = spec.get("tax_override")
    if tax is None:
        tax = round(subtotal * vendor["tax_rate"], 2)
    total = round(subtotal + tax, 2)
    expected = spec["expected"]
    assert (subtotal, tax, total) == expected, f"{spec['id']}: computed {(subtotal, tax, total)} != expected {expected}"
    return {
        "spec": spec,
        "vendor": vendor,
        "doc": VENDOR_DOC[vendor["id"]],
        "lines": lines,
        "subtotal": subtotal,
        "tax": tax,
        "total": total,
        "due_date": iso_plus(spec["issue_date"], TERMS_DAYS[vendor["payment_terms"]]),
    }


# ---------------------------------------------------------------- templates


def render_common_footer(p: Page, fonts: dict) -> None:
    p.text("Thank you for your business.", PAGE_W / 2 - 60, 762, fonts["italic"], 8, color=MUTED)


def render_remit(p: Page, inv: dict, fonts: dict, top: float, *, boxed: bool) -> None:
    spec, vendor, doc = inv["spec"], inv["vendor"], inv["doc"]
    if boxed:
        p.rect(40, top - 12, PAGE_W - 80, 64, stroke=RULE)
    p.text("REMIT TO", 48 if boxed else 40, top, fonts["bold"], 8, color=MUTED)
    x = 48 if boxed else 40
    p.text(vendor["name"], x, top + 13, fonts["regular"], 9)
    p.text(f"{doc['bank_name']}  ·  Routing {doc['routing']}", x, top + 25, fonts["regular"], 9)
    x_end = p.text("Account ending ", x, top + 37, fonts["regular"], 9)
    p.text(f"****{spec['bank_last4']}", x_end, top + 37, fonts["bold"], 9, key="bank_account")
    note = spec.get("remit_note")
    if note:
        p.text(note, x, top + 49, fonts["italic"], 8.5, color=colors.Color(0.55, 0.12, 0.12))


def render_lines_a(p: Page, inv: dict, fonts: dict) -> float:
    header_top = 250
    p.rect(40, header_top, PAGE_W - 80, 18, fill=BAND)
    p.text("#", 46, header_top + 12.5, fonts["bold"], 8.5, color=MUTED)
    p.text("DESCRIPTION", 66, header_top + 12.5, fonts["bold"], 8.5, color=MUTED)
    p.text("QTY", 372, header_top + 12.5, fonts["bold"], 8.5, align="right", color=MUTED)
    p.text("UNIT", 384, header_top + 12.5, fonts["bold"], 8.5, color=MUTED)
    p.text("UNIT PRICE", 468, header_top + 12.5, fonts["bold"], 8.5, align="right", color=MUTED)
    p.text("AMOUNT", 566, header_top + 12.5, fonts["bold"], 8.5, align="right", color=MUTED)
    top = header_top + 18
    for ln in inv["lines"]:
        n = ln["line"]
        base = top + 14
        p.text(str(n), 46, base, fonts["regular"], 10, color=MUTED)
        p.text(ln["description"], 66, base, fonts["regular"], 10, key=f"line:{n}:description")
        p.text(str(ln["qty"]), 372, base, fonts["regular"], 10, align="right", key=f"line:{n}:qty")
        p.text(ln["unit"], 384, base, fonts["regular"], 10, color=MUTED)
        p.text(money(ln["unit_price"]), 468, base, fonts["regular"], 10, align="right", key=f"line:{n}:unit_price")
        p.text(money(ln["amount"]), 566, base, fonts["regular"], 10, align="right", key=f"line:{n}:amount")
        top += 20
        p.hline(40, PAGE_W - 40, top)
    return top


def render_totals_a(p: Page, inv: dict, fonts: dict, top: float) -> None:
    vendor = inv["vendor"]
    rate_pct = f"{vendor['tax_rate'] * 100:g}%"
    p.text("Subtotal", 440, top + 22, fonts["regular"], 10, color=MUTED)
    p.text(money(inv["subtotal"]), 566, top + 22, fonts["regular"], 10, align="right", key="subtotal")
    p.text(f"Tax ({rate_pct})", 440, top + 40, fonts["regular"], 10, color=MUTED)
    p.text(money(inv["tax"]), 566, top + 40, fonts["regular"], 10, align="right", key="tax")
    p.hline(432, PAGE_W - 40, top + 50, color=INK, width=0.8)
    p.text("TOTAL DUE", 440, top + 66, fonts["bold"], 11)
    p.text(money(inv["total"]), 566, top + 66, fonts["bold"], 11, align="right", key="total")
    p.text(f"Payment terms: {vendor['payment_terms']}. Please reference the invoice number on your remittance.", 40, top + 22, fonts["regular"], 8.5, color=MUTED)


def render_template_a(p: Page, inv: dict, logo: Path) -> None:
    spec, vendor, doc = inv["spec"], inv["vendor"], inv["doc"]
    fonts = FONTS["A"]
    p.rect(0, 0, PAGE_W, 92, fill=BAND)
    p.image(logo, 40, 24, *LOGO_PT)
    p.text("INVOICE", 572, 62, fonts["bold"], 24, align="right", color=INK)
    p.text(vendor["name"], 40, 122, fonts["bold"], 13, key="vendor_name")
    for i, addr in enumerate(doc["address"]):
        p.text(addr, 40, 137 + i * 12, fonts["regular"], 9, color=MUTED)

    meta = [("Invoice #", spec["invoice_number"], "invoice_number"), ("Invoice date", spec["issue_date"], "issue_date"), ("Due date", inv["due_date"], "due_date")]
    if spec["po_number"]:
        meta.append(("PO number", spec["po_number"], "po_number"))
    else:
        meta.append(("Terms", vendor["payment_terms"], None))
    for i, (label, value, key) in enumerate(meta):
        base = 122 + i * 15
        p.text(label, 430, base, fonts["regular"], 9, color=MUTED)
        p.text(value, 566, base, fonts["bold"], 10, align="right", key=key)

    p.text("BILL TO", 40, 192, fonts["bold"], 8, color=MUTED)
    for i, s in enumerate(BILL_TO):
        p.text(s, 40, 206 + i * 12, fonts["regular"], 9)

    bottom = render_lines_a(p, inv, fonts)
    render_totals_a(p, inv, fonts, bottom)
    render_remit(p, inv, fonts, 682, boxed=False)
    render_common_footer(p, fonts)


def render_lines_b(p: Page, inv: dict, fonts: dict) -> float:
    cols = [40, 58, 340, 390, 428, 496, 572]
    header_top = 248
    p.rect(40, header_top, PAGE_W - 80, 18, fill=BAND, stroke=RULE)
    labels = [("#", 44, "left"), ("Description", 62, "left"), ("Qty", 384, "right"), ("Unit", 396, "left"), ("Unit Price", 490, "right"), ("Amount", 566, "right")]
    for s, x, align in labels:
        p.text(s, x, header_top + 12.5, fonts["bold"], 9, align=align)
    top = header_top + 18
    for ln in inv["lines"]:
        n = ln["line"]
        base = top + 14
        p.text(str(n), 44, base, fonts["regular"], 10, color=MUTED)
        p.text(ln["description"], 62, base, fonts["regular"], 10, key=f"line:{n}:description")
        p.text(str(ln["qty"]), 384, base, fonts["regular"], 10, align="right", key=f"line:{n}:qty")
        p.text(ln["unit"], 396, base, fonts["regular"], 10, color=MUTED)
        p.text(money(ln["unit_price"]), 490, base, fonts["regular"], 10, align="right", key=f"line:{n}:unit_price")
        p.text(money(ln["amount"]), 566, base, fonts["regular"], 10, align="right", key=f"line:{n}:amount")
        top += 20
        p.hline(40, PAGE_W - 40, top)
    for x in cols:
        p.vline(x, header_top, top)
    return top


def render_totals_b(p: Page, inv: dict, fonts: dict, top: float) -> None:
    vendor = inv["vendor"]
    rate_pct = f"{vendor['tax_rate'] * 100:g}%"
    box_top = top + 10
    p.rect(372, box_top, 200, 60, stroke=RULE)
    p.hline(372, 572, box_top + 20)
    p.hline(372, 572, box_top + 40)
    p.vline(452, box_top, box_top + 60)
    rows = [("Subtotal", money(inv["subtotal"]), "subtotal", fonts["regular"]), (f"Tax ({rate_pct})", money(inv["tax"]), "tax", fonts["regular"]), ("Total", money(inv["total"]), "total", fonts["bold"])]
    for i, (label, value, key, font) in enumerate(rows):
        base = box_top + 14 + i * 20
        p.text(label, 378, base, font, 9.5)
        p.text(value, 566, base, font, 10, align="right", key=key)
    p.text(f"Terms: {vendor['payment_terms']}. Please quote the invoice number when remitting.", 40, box_top + 14, fonts["italic"], 8.5, color=MUTED)


def render_template_b(p: Page, inv: dict, logo: Path) -> None:
    spec, vendor, doc = inv["spec"], inv["vendor"], inv["doc"]
    fonts = FONTS["B"]
    p.image(logo, 40, 34, *LOGO_PT)
    p.text("INVOICE", 572, 52, fonts["bold"], 20, align="right")
    p.text(vendor["name"], 40, 100, fonts["bold"], 14, key="vendor_name")
    for i, addr in enumerate(doc["address"]):
        p.text(addr, 40, 115 + i * 12, fonts["regular"], 9, color=MUTED)

    meta = [("Invoice No.", spec["invoice_number"], "invoice_number"), ("Invoice Date", spec["issue_date"], "issue_date"), ("Due Date", inv["due_date"], "due_date")]
    if spec["po_number"]:
        meta.append(("PO Number", spec["po_number"], "po_number"))
    else:
        meta.append(("Terms", vendor["payment_terms"], None))
    box_top = 64
    p.rect(372, box_top, 200, 20 * len(meta), stroke=RULE)
    p.vline(452, box_top, box_top + 20 * len(meta))
    for i, (label, value, key) in enumerate(meta):
        if i:
            p.hline(372, 572, box_top + 20 * i)
        base = box_top + 14 + i * 20
        p.text(label, 378, base, fonts["regular"], 9, color=MUTED)
        p.text(value, 566, base, fonts["bold"], 10, align="right", key=key)

    p.text("Bill To:", 40, 178, fonts["bold"], 9)
    for i, s in enumerate(BILL_TO):
        p.text(s, 40, 192 + i * 12, fonts["regular"], 9)

    bottom = render_lines_b(p, inv, fonts)
    render_totals_b(p, inv, fonts, bottom)
    render_remit(p, inv, fonts, 692, boxed=True)
    render_common_footer(p, fonts)


def apply_stamp(p: Page, inv: dict) -> None:
    spec = inv["spec"]
    stamp = spec.get("stamp")
    if not stamp:
        return
    path = make_stamp(spec["id"], stamp["date"])
    where = stamp["where"]
    if where == "blank":
        p.stamp(path, 200, 540)
        return
    x0, y0, x1, y1 = p.boxes_pt[where]
    p.stamp(path, (x0 + x1) / 2, (y0 + y1) / 2 + 4)


# ---------------------------------------------------------------- pipeline


def render_pdf(inv: dict) -> Path:
    spec = inv["spec"]
    pdf_path = OUT / f"{spec['id']}.pdf"
    c = canvas.Canvas(str(pdf_path), pagesize=letter, invariant=1, pageCompression=0)
    c.setTitle(f"Invoice {spec['invoice_number']}")
    c.setAuthor(inv["vendor"]["name"])
    p = Page(c)
    logo = make_logo(inv["vendor"]["id"])
    if inv["doc"]["template"] == "A":
        render_template_a(p, inv, logo)
    else:
        render_template_b(p, inv, logo)
    apply_stamp(p, inv)
    c.showPage()
    c.save()
    inv["boxes"] = p.boxes
    return pdf_path


def rasterize(pdf_path: Path, inv_id: str) -> tuple[str, int, int]:
    png_dir = PUBLIC / inv_id
    png_dir.mkdir(parents=True, exist_ok=True)
    png_path = png_dir / "page-1.png"
    with pymupdf.open(str(pdf_path)) as doc:
        pix = doc[0].get_pixmap(dpi=DPI, alpha=False)
        pix.save(str(png_path))
        return f"/invoices/{inv_id}/page-1.png", pix.width, pix.height


HEADER_FIELDS = ["invoice_number", "issue_date", "due_date", "po_number", "vendor_name", "subtotal", "tax", "total", "bank_account"]


def build_json(inv: dict, image: str, width: int, height: int) -> dict:
    spec, vendor, boxes = inv["spec"], inv["vendor"], inv["boxes"]
    inv_id = spec["id"]
    overrides = spec.get("confidence_overrides", {})
    values = {
        "invoice_number": spec["invoice_number"],
        "issue_date": spec["issue_date"],
        "due_date": inv["due_date"],
        "po_number": spec["po_number"],
        "vendor_name": vendor["name"],
        "subtotal": f"{inv['subtotal']:.2f}",
        "tax": f"{inv['tax']:.2f}",
        "total": f"{inv['total']:.2f}",
        "bank_account": f"****{spec['bank_last4']}",
    }
    fields = {}
    for key in HEADER_FIELDS:
        if key == "po_number" and not spec["po_number"]:
            continue
        fields[key] = {
            "value": values[key],
            "confidence": overrides.get(key, confidence(inv_id, key)),
            "page": 1,
            "bbox": boxes[key],
        }
    line_items = []
    for ln in inv["lines"]:
        n = ln["line"]
        line_items.append({
            "line": n,
            "description": ln["description"],
            "qty": ln["qty"],
            "unit": ln["unit"],
            "unit_price": round(ln["unit_price"], 2),
            "amount": round(ln["amount"], 2),
            "confidence": overrides.get(f"line:{n}", confidence(inv_id, f"line:{n}")),
            "page": 1,
            "bbox": {k: boxes[f"line:{n}:{k}"] for k in ("description", "qty", "unit_price", "amount")},
        })
    out = {
        "id": inv_id,
        "invoice_number": spec["invoice_number"],
        "vendor_id": vendor["id"],
        "vendor_name_on_doc": vendor["name"],
        "issue_date": spec["issue_date"],
        "due_date": inv["due_date"],
        "currency": "USD",
    }
    if spec["po_number"]:
        out["po_number"] = spec["po_number"]
    out.update({
        "subtotal": round(inv["subtotal"], 2),
        "tax": round(inv["tax"], 2),
        "total": round(inv["total"], 2),
        "bank_account_last4_on_doc": spec["bank_last4"],
        "initial_status": spec["initial_status"],
    })
    if spec.get("approved_on"):
        out["approved_on"] = spec["approved_on"]
    out.update({
        "scenario": spec["scenario"],
        "pages": [{"page": 1, "image": image, "width_px": width, "height_px": height}],
        "fields": fields,
        "line_items": line_items,
    })
    return out


def write_reference_tables() -> None:
    write_json(DATA / "vendors.json", VENDORS)
    write_json(DATA / "pos.json", POS)
    po_by_number = {po["po_number"]: po for po in POS}
    receipts = []
    for r in RECEIPTS:
        po = po_by_number[r["po_number"]]
        receipts.append({**r, "lines": [{"line": ln["line"], "qty_received": ln["qty"]} for ln in po["lines"]]})
    write_json(DATA / "receipts.json", receipts)
    write_json(DATA / "gl_codes.json", GL_CODES)


def print_bbox_table(doc: dict) -> None:
    print(f"\n{doc['id']} field bboxes (fractions, [x0, y0, x1, y1]):")
    print(f"  {'field':<24} {'value':<28} {'conf':>6}  bbox")
    for key, f in doc["fields"].items():
        print(f"  {key:<24} {f['value']:<28} {f['confidence']:>6.4f}  {f['bbox']}")
    for ln in doc["line_items"]:
        for k, box in ln["bbox"].items():
            label = f"line:{ln['line']}:{k}"
            value = str(ln[k])
            print(f"  {label:<24} {value:<28} {ln['confidence']:>6.4f}  {box}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    (DATA / "invoices").mkdir(parents=True, exist_ok=True)
    write_reference_tables()
    docs = {}
    for spec in INVOICES:
        inv = build_invoice(spec)
        pdf_path = render_pdf(inv)
        image, width, height = rasterize(pdf_path, spec["id"])
        doc = build_json(inv, image, width, height)
        write_json(DATA / "invoices" / f"{spec['id']}.json", doc)
        docs[spec["id"]] = doc
        print(f"{spec['id']:<9} {spec['invoice_number']:<14} {inv['vendor']['name']:<28} total {money(inv['total']):>12}  {width}x{height}")
    print_bbox_table(docs["inv_002"])


if __name__ == "__main__":
    main()
