#!/usr/bin/env python3
# Aperçu maquettes Democracy Together : couverture A4 + une capture ENTIÈRE par page PDF
# (chaque page a une hauteur sur-mesure calée sur la proportion de la capture).
import os, math, html
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
FULL = os.path.join(HERE, "img", "full")

# Mise en page (mm)
PAGE_W   = 210          # largeur de page
MARGIN_X = 10           # marge latérale -> largeur image
IMG_W    = PAGE_W - 2 * MARGIN_X
TOP      = 16           # bandeau (11) + filet + respiration
BOTTOM   = 8            # marge basse

# Hiérarchie : sections (parcours du site) -> pages.  (fichier, titre)
GROUPS = [
    ("Découverte & institutionnel", [
        ("accueil.png",       "Accueil"),
        ("a-propos.png",      "À propos & gouvernance"),
    ]),
    ("Connaissances & données", [
        ("bibliotheque.png",  "Bibliothèque"),
        ("publication.png",   "Fiche publication"),
        ("barometre.png",     "Baromètre de la démocratie"),
    ]),
    ("Réseau & événements", [
        ("evenements.png",    "Événements · agenda"),
        ("evenement.png",     "Page événement & billetterie"),
    ]),
    ("Engagement & adhésion", [
        ("jeunes.png",        "Hub jeunes"),
        ("adhesion.png",      "Adhésion & cotisation"),
    ]),
    ("Espace membre", [
        ("espace-membre.png", "Espace membre"),
    ]),
    ("Référence design", [
        ("style-guide.png",   "Système de design"),
        ("accueil-dark.png",  "Accueil — mode sombre"),
    ]),
]

# Aplatissement + numérotation séquentielle 01..N (chaque page porte sa section)
built = []   # (code, title, rel, page_h, section)
n = 0
for section, pages in GROUPS:
    for fn, title in pages:
        p = os.path.join(FULL, fn)
        if not os.path.exists(p):
            print("MANQUANT:", p); continue
        n += 1
        code = f"{n:02d}"
        w, h = Image.open(p).size
        img_h_mm = h / w * IMG_W
        page_h = math.ceil(TOP + img_h_mm + BOTTOM) + 1
        rel = os.path.join("img", "full", fn)
        built.append((code, title, rel, page_h, section))

# Couleurs
PAPER="#F4F2EC"; SURFACE="#FBFAF5"; INK="#16191F"; INKSOFT="#454953"
META="#646771"; RULE="#D9D6CD"; INDIGO="#1F3D6E"; SAFRAN="#DB8A34"; TEAL="#2E6E8E"

def esc(s): return html.escape(s)

stripe = (f'<div class="stripe"><span style="background:{INDIGO}"></span>'
          f'<span style="background:{SAFRAN}"></span>'
          f'<span style="background:{TEAL}"></span></div>')

# @page nommées (une taille par capture)
page_rules = [f"@page cover {{ size: A4; margin:0 }}"]
for i, (code, title, rel, page_h, section) in enumerate(built):
    page_rules.append(f"@page p{i} {{ size: {PAGE_W}mm {page_h}mm; margin:0 }}")
page_rules = "\n".join(page_rules)

# Sommaire groupé par section
toc_blocks = []
idx = 0
for s_no, (section, pages) in enumerate(GROUPS, 1):
    items = []
    for _ in pages:
        code, title, _, _, _ = built[idx]; idx += 1
        items.append(f'<li><span class="num">{esc(code)}</span> · {esc(title)}</li>')
    toc_blocks.append(
        f'<div class="toc-group"><div class="toc-sec">'
        f'<span class="toc-sec-no">{s_no:02d}</span> {esc(section)}</div>'
        f'<ul>{"".join(items)}</ul></div>'
    )
toc = "".join(toc_blocks)
cover = f"""
<section class="page cover">
  <div class="rail"></div>
  <div class="cover-stripe"><span style="background:{INDIGO}"></span><span style="background:{SAFRAN}"></span><span style="background:{TEAL}"></span></div>
  <div class="eyebrow">MAQUETTES HAUTE-FIDÉLITÉ · APERÇU DE LA PLATEFORME</div>
  <h1>Democracy<br><span class="h1-it">Together</span></h1>
  <p class="lede">Réseau international de think tanks pour la démocratie<br>Afrique–Europe · plateforme d'agrégation des analyses</p>
  <p class="meta-cover">Aperçu visuel de l'interface — site public &amp; espace membre<br>
  {len(built)} pages · captures pleine hauteur · clair &amp; sombre · v1</p>
  <div class="toc-label">PAGES PRÉSENTÉES</div>
  <div class="toc">{toc}</div>
  <div class="cover-foot">Préparé par Be in Digital · direction design Democracy Together<br>
  Juin 2026 · captures et données présentées à titre d'illustration</div>
</section>
"""

# Pages : une capture entière par page
shots = []
for i, (code, title, rel, page_h, section) in enumerate(built):
    shots.append(f"""
<section class="page shotpage pp{i}">
  <div class="bar">
    <span class="bar-l">Democracy Together · {esc(section)}</span>
    <span class="bar-r">{esc(code)} · {esc(title.upper())}</span>
  </div>
  {stripe}
  <div class="shot"><img src="{rel}" alt="{esc(title)}"></div>
</section>
""")

# CSS classes pp{i} -> page p{i} (+ hauteur explicite, sinon le conteneur s'effondre)
pp_css = "\n".join(
    f".pp{i}{{page:p{i};height:{page_h}mm}}"
    for i, (_, _, _, page_h, _) in enumerate(built)
)

doc = f"""<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Democracy Together — Aperçu maquettes</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<style>
:root{{
  --paper:{PAPER}; --ink:{INK}; --inksoft:{INKSOFT};
  --meta:{META}; --rule:{RULE}; --indigo:{INDIGO}; --safran:{SAFRAN}; --teal:{TEAL};
}}
*{{box-sizing:border-box;margin:0;padding:0}}
{page_rules}
.cover{{page:cover}}
{pp_css}
html,body{{background:#fff}}
body{{font-family:"IBM Plex Sans",-apple-system,Helvetica,Arial,sans-serif;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.page{{position:relative;width:{PAGE_W}mm;background:var(--paper);overflow:hidden;page-break-after:always;break-after:page}}
.page:last-child{{page-break-after:auto}}
.cover{{height:297mm;padding:34mm 22mm 20mm}}

/* Couverture */
.cover .rail{{position:absolute;top:28mm;bottom:28mm;right:16mm;width:1.4mm;background:var(--indigo)}}
.cover-stripe{{position:absolute;top:24mm;left:22mm;width:34mm;height:2.4mm;display:flex}}
.cover-stripe span{{flex:1}}
.eyebrow{{font-size:9.5pt;letter-spacing:.22em;font-weight:600;color:var(--indigo);margin-top:6mm}}
h1{{font-family:"Newsreader",Georgia,serif;font-weight:500;font-size:64pt;line-height:.98;letter-spacing:-.01em;color:var(--ink);margin:11mm 0 0}}
.h1-it{{font-style:italic;font-weight:400;color:var(--indigo);font-size:46pt}}
.lede{{font-family:"Newsreader",Georgia,serif;font-style:italic;font-size:17pt;line-height:1.35;color:var(--inksoft);margin-top:9mm;max-width:130mm}}
.meta-cover{{font-size:10pt;line-height:1.7;color:var(--meta);margin-top:8mm}}
.toc-label{{font-size:9pt;letter-spacing:.2em;font-weight:600;color:var(--indigo);margin-top:13mm}}
.toc{{margin-top:5mm;columns:2;column-gap:14mm;max-width:158mm}}
.toc-group{{break-inside:avoid;margin-bottom:5mm}}
.toc-sec{{font-family:"Newsreader",Georgia,serif;font-size:12.5pt;color:var(--ink);padding-bottom:1.6mm;margin-bottom:1.6mm;border-bottom:.3mm solid var(--rule);display:flex;align-items:baseline;gap:2.5mm}}
.toc-sec-no{{font-family:"IBM Plex Mono",monospace;font-size:8.5pt;color:var(--safran)}}
.toc ul{{list-style:none}}
.toc li{{font-size:10.5pt;color:var(--ink);padding:1.4mm 0;display:flex;align-items:baseline;gap:2.5mm}}
.toc li::before{{content:"";display:inline-block;width:1.8mm;height:1.8mm;background:var(--indigo);flex:0 0 auto;transform:translateY(.2mm)}}
.toc .num{{font-family:"IBM Plex Mono",monospace;font-size:9pt;color:var(--meta)}}
.cover-foot{{position:absolute;left:22mm;bottom:18mm;font-size:8.6pt;line-height:1.7;color:var(--meta)}}

/* Pages captures */
.bar{{position:absolute;top:0;left:0;right:0;height:11mm;background:var(--indigo);
  display:flex;align-items:center;justify-content:space-between;padding:0 {MARGIN_X}mm;color:var(--paper);z-index:2}}
.bar-l{{font-size:8.6pt;letter-spacing:.06em;color:rgba(244,242,236,.78)}}
.bar-r{{font-size:8.8pt;letter-spacing:.12em;font-weight:600;color:#fff}}
.stripe{{position:absolute;top:11mm;left:0;right:0;height:1.6mm;display:flex;z-index:2}}
.stripe span{{flex:1}}
.shot{{position:absolute;top:{TOP}mm;left:{MARGIN_X}mm;right:{MARGIN_X}mm}}
.shot img{{width:100%;display:block;border:.4mm solid var(--rule)}}
</style></head><body>
{cover}
{''.join(shots)}
</body></html>"""

out_html = os.path.join(HERE, "democracy-together-apercu-maquettes.html")
with open(out_html, "w") as f:
    f.write(doc)

print(f"HTML écrit : {out_html}")
print(f"Pages : 1 couverture + {len(built)} captures pleine hauteur")
cur = None
for code, title, rel, page_h, section in built:
    if section != cur:
        print(f"— {section}"); cur = section
    print(f"  {code} {title}: page {PAGE_W}×{page_h}mm")
