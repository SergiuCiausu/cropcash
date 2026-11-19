#!/usr/bin/env python3
"""Builds cropcash-pitch-gif.pptx: normal PowerPoint slides with one looping GIF per app demo.

Reads the same storyboard.yaml and recorded clips as the video deck (nothing is re-recorded).
Layout comes from the demo-deck template, measured in a browser by gif_layout.cjs.

    python build_gif_deck.py          (run from pptx/, with PYTHONUTF8=1 and ffmpeg on PATH)
"""
import copy, io, json, os, re, subprocess, sys, tempfile, zipfile

from lxml import etree

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(os.path.expanduser('~'), '.claude', 'skills', 'demo-deck', 'scripts')
sys.path.insert(0, SCRIPTS)

from PIL import Image  # noqa: E402
from pptx import Presentation  # noqa: E402
from pptx.dml.color import RGBColor  # noqa: E402
from pptx.enum.shapes import MSO_SHAPE  # noqa: E402
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN  # noqa: E402
from pptx.oxml.ns import qn  # noqa: E402
from pptx.util import Emu, Pt  # noqa: E402

import compose  # noqa: E402
import make_deck  # noqa: E402

GIF_FPS = '12.5'         # GIF delays are whole centiseconds: 12.5 fps is exactly 8 cs per frame
GIF_COLORS = 128
GIF_END_HOLD = 3.0       # seconds on the last frame before the loop restarts
FADE_MS = 400
FONT = 'Geist'
OUT = 'cropcash-pitch-gif.pptx'
PX = 12192000 / 1920     # EMU per template pixel


def px(v):
    return Emu(int(round(v * PX)))


def rgb(css, bg=(0x18, 0x20, 0x1C)):
    """A CSS color as RGBColor. Translucent colors are flattened onto the slide background."""
    nums = [float(n) for n in re.findall(r'[\d.]+', css)]
    if css.startswith('color('):
        r, g, b = (n * 255 for n in nums[:3])
        a = nums[3] if len(nums) > 3 else 1
    else:
        r, g, b = nums[:3]
        a = nums[3] if len(nums) > 3 else 1
    return RGBColor(*(int(round(c * a + b0 * (1 - a))) for c, b0 in zip((r, g, b), bg)))


def hexcolor(value):
    return RGBColor.from_string(value.lstrip('#').upper())


# ---------- GIFs ----------

def make_gif(demo, slot, path):
    """Same trim, speed and eased zooms as the video deck, then a held last frame."""
    from_t, to_t = demo['trim']
    w, h = round(slot['w']), round(slot['h'])
    sw, sh, _ = compose.probe(demo['clip'])
    speed = float(demo['speed'])
    chain = [f"trim=start={from_t}" + (f":end={to_t}" if to_t is not None else ''), f"setpts=(PTS-STARTPTS)/{speed}"]
    if demo['zooms']:
        terms = compose.ease_terms(demo['zooms'], from_t, speed)
        z = '1' + ''.join(f"+({float(q['scale']) - 1:.4f})*{e}" for q, e in terms)
        cx = f"{sw / 2}" + ''.join(f"+({float(q['cx']) - sw / 2:.2f})*{e}" for q, e in terms)
        cy = f"{sh / 2}" + ''.join(f"+({float(q['cy']) - sh / 2:.2f})*{e}" for q, e in terms)
        chain.append(f"scale=w='2*trunc({sw}*({z})/2)':h='2*trunc({sh}*({z})/2)':eval=frame:flags=bicubic")
        chain.append(f"crop={sw}:{sh}:x='clip(({cx})*({z})-{sw}/2,0,{sw}*({z})-{sw})':y='clip(({cy})*({z})-{sh}/2,0,{sh}*({z})-{sh})':exact=1")
    chain += [f"scale={w}:{h}:flags=lanczos", 'setsar=1', f"tpad=stop_mode=clone:stop_duration={GIF_END_HOLD}", f"fps={GIF_FPS}"]
    graph = ','.join(chain) + f",split[a][b];[a]palettegen=max_colors={GIF_COLORS}:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle"
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', demo['clip'], '-filter_complex', graph, '-loop', '0', path], check=True)
    return path


# ---------- Native text and shapes ----------

def style_paragraph(par, spec, bold):
    pPr = par._p.get_or_add_pPr()
    for tag in ('a:lnSpc',):
        for old in pPr.findall(qn(tag)):
            pPr.remove(old)
    ln = etree.SubElement(pPr, qn('a:lnSpc'))
    etree.SubElement(ln, qn('a:spcPts')).set('val', str(int(round((spec['line'] or spec['h'] / len(spec.get('lines') or [1])) * 50))))
    pPr.insert(0, ln)
    par.alignment = {'right': PP_ALIGN.RIGHT, 'center': PP_ALIGN.CENTER}.get(spec.get('align'), PP_ALIGN.LEFT)
    for run in par.runs:
        semibold = bold and spec.get('weight') == 600
        run.font.name = FONT + ' SemiBold' if semibold else FONT
        run.font.size = Pt(spec['size'] / 2)
        run.font.bold = bold and not semibold
        run.font.color.rgb = rgb(spec['color'])
        # PowerPoint skips this font's kerning, so text runs wide; tighten it to the browser's width.
        spacing = spec.get('spacing') or 0
        if spacing <= 0:
            spacing -= 0.008 * spec['size']
        run._r.get_or_add_rPr().set('spc', str(int(round(spacing * 50))))


def frame_text(tf):
    tf.word_wrap = True
    tf.auto_size = None
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.TOP


def add_text(slide, spec, name, bold=None):
    """A text box at the measured place, a little wider so PowerPoint wraps like the browser."""
    extra = 28
    left = spec['x'] - (extra if spec.get('align') == 'right' else 0)
    box = slide.shapes.add_textbox(px(left), px(spec['y']), px(spec['w'] + extra), px(spec['h']))
    box.name = name
    frame_text(box.text_frame)
    par = box.text_frame.paragraphs[0]
    par.text = spec['text']
    style_paragraph(par, spec, spec['weight'] >= 600 if bold is None else bold)
    return box


def set_bullet(par, accent, indent_px):
    pPr = par._p.get_or_add_pPr()
    pPr.set('marL', str(int(indent_px * PX)))
    pPr.set('indent', str(-int(indent_px * PX)))
    for old in pPr.findall(qn('a:buNone')):
        pPr.remove(old)
    color = etree.SubElement(pPr, qn('a:buClr'))
    etree.SubElement(color, qn('a:srgbClr')).set('val', str(accent))
    font = etree.SubElement(pPr, qn('a:buFont'))
    font.set('typeface', 'Arial')
    etree.SubElement(pPr, qn('a:buChar')).set('char', '•')


def add_bullets(slide, m, accent):
    specs = m['bullets']
    if not specs:
        return
    extra = 8
    if len({round(b['x']) for b in specs}) == 1:
        box = slide.shapes.add_textbox(px(m['points']['x']), px(m['points']['y']), px(m['points']['w'] + extra), px(m['points']['h']))
        box.name = 'Idei'
        frame_text(box.text_frame)
        gap = (specs[1]['y'] - specs[0]['y'] - specs[0]['h']) if len(specs) > 1 else 0
        for i, b in enumerate(specs):
            par = box.text_frame.paragraphs[0] if i == 0 else box.text_frame.add_paragraph()
            par.text = b['text']
            style_paragraph(par, b, False)
            set_bullet(par, accent, 44)
            if i:
                par.space_before = Pt(gap / 2)
    else:  # closing slides: one column per point
        for i, b in enumerate(specs, 1):
            box = add_text(slide, b, f'Idee {i}', bold=False)
            set_bullet(box.text_frame.paragraphs[0], accent, 44)


def solid(shape, color):
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    shape.shadow.inherit = False


def add_browser_frame(slide, m):
    """The browser window as editable shapes, grouped, behind the GIF."""
    win, bar = m['window'], m['bar']
    group = slide.shapes.add_group_shape()
    group.name = 'Fereastră browser'
    add = group.shapes.add_shape
    body = add(MSO_SHAPE.ROUND_2_SAME_RECTANGLE, px(win['x']), px(win['y']), px(win['w']), px(win['h']))
    body.adjustments[0] = 14 / min(win['w'], win['h'])
    solid(body, hexcolor('#0B0D18'))
    spPr = body._element.spPr
    for old in spPr.findall(qn('a:effectLst')):
        spPr.remove(old)
    effects = etree.SubElement(spPr, qn('a:effectLst'))
    shadow = etree.SubElement(effects, qn('a:outerShdw'), blurRad=str(int(80 * PX)), dist=str(int(30 * PX)), dir='5400000', algn='ctr', rotWithShape='0')
    etree.SubElement(etree.SubElement(shadow, qn('a:srgbClr'), val='000000'), qn('a:alpha'), val='45000')
    top = add(MSO_SHAPE.ROUND_2_SAME_RECTANGLE, px(bar['x']), px(bar['y']), px(bar['w']), px(bar['h']))
    top.adjustments[0] = 14 / min(bar['w'], bar['h'])
    solid(top, hexcolor('#1D2138'))
    for d in m['dots']:
        dot = add(MSO_SHAPE.OVAL, px(d['x']), px(d['y']), px(d['w']), px(d['h']))
        solid(dot, hexcolor('#3A3F5C'))
    url = m['url']
    pill = add(MSO_SHAPE.ROUNDED_RECTANGLE, px(url['x']), px(url['y']), px(url['w']), px(url['h']))
    pill.adjustments[0] = 6 / min(url['w'], url['h'])
    solid(pill, hexcolor('#12152A'))
    tf = pill.text_frame
    tf.word_wrap = False
    tf.margin_left = px(12)
    tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    par = tf.paragraphs[0]
    par.text = url['text']
    par.alignment = PP_ALIGN.LEFT
    for run in par.runs:
        run.font.name = FONT
        run.font.size = Pt(url['size'] / 2)
        run.font.color.rgb = rgb(url['color'])


def set_fade(slide):
    sld = slide._element
    xml = (f'<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:p="{sld.nsmap["p"]}">'
           f'<mc:Choice xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" Requires="p14"><p:transition spd="fast" p14:dur="{FADE_MS}"><p:fade/></p:transition></mc:Choice>'
           '<mc:Fallback><p:transition spd="fast"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>')
    sld.find(qn('p:clrMapOvr')).addnext(etree.fromstring(xml))


def set_theme_and_background(prs, background):
    """Master background image, and Geist as the theme font so new text matches."""
    master = prs.slide_master
    _, rid = master.part.get_or_add_image_part(background)
    cSld = master._element.find(qn('p:cSld'))
    for old in cSld.findall(qn('p:bg')):
        cSld.remove(old)
    bg = etree.fromstring(
        f'<p:bg xmlns:p="{cSld.nsmap["p"]}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:bgPr>'
        f'<a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="{rid}"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill>'
        '<a:effectLst/></p:bgPr></p:bg>')
    cSld.insert(0, bg)
    for rel in master.part.rels.values():
        if rel.reltype.endswith('/theme'):
            theme = rel.target_part
            blob = re.sub(rb'(<a:(?:majorFont|minorFont)>\s*<a:latin typeface=")[^"]*', rb'\g<1>' + FONT.encode(), theme.blob)
            theme._blob = blob


def build(deck):
    build_dir = deck.p('build')
    gifs = os.path.join(build_dir, 'gifs')
    os.makedirs(gifs, exist_ok=True)
    total = len(deck.slides)
    plans = [(s, deck.plan(s, i, total)) for i, s in enumerate(deck.slides, 1)]
    for _, p in plans:  # keep an amount and its unit on one line
        fields = p['slide_data']['slide']
        if 'title' in fields:
            fields['title'] = re.sub(r'(?<=\d) lei', '\u00a0lei', fields['title'])
    background = os.path.join(build_dir, 'gif-background.png')
    layout_json = os.path.join(build_dir, 'gif-layout.json')
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf8') as job:
        json.dump({'template': os.path.join(make_deck.SKILL, 'assets', 'template.html'), 'out': layout_json, 'background': background,
                   'slides': [{'id': s['id'], 'slide_data': p['slide_data']} for s, p in plans]}, job)
    subprocess.run(['node', os.path.join(HERE, 'gif_layout.cjs'), job.name], check=True)
    os.unlink(job.name)
    layout = json.load(open(layout_json, encoding='utf8'))

    brand = deck.deck['brand']
    accent = hexcolor(brand['accent'])
    logo = deck.p(brand['logo'])
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)
    prs.core_properties.title = deck.deck.get('title', '')
    set_theme_and_background(prs, background)
    title_only = prs.slide_layouts[5]

    for s, plan in plans:
        m = layout[s['id']]
        slide = prs.slides.add_slide(title_only)
        title = slide.shapes.title
        spec = m['title'] or m['label']  # metric slides: the label is the slide's title
        title.left, title.top, title.width, title.height = px(spec['x']), px(spec['y']), px(spec['w'] + 80), px(spec['h'])
        frame_text(title.text_frame)
        title.text_frame.paragraphs[0].text = ''.join(spec['lines'])  # soft breaks: same lines as the browser
        style_paragraph(title.text_frame.paragraphs[0], spec, True)
        if m['value']:
            add_text(slide, m['value'], 'Cifră', bold=True)
        if m['kicker']:
            add_text(slide, m['kicker'], 'Secțiune', bold=True)
        if m['sub']:
            add_text(slide, m['sub'], 'Subtitlu', bold=False)
        add_bullets(slide, m, accent)
        if m['cta']:
            add_text(slide, m['cta'], 'Mesaj', bold=True)
        if s.get('qr'):  # bottom right, between the bullets and the footer logo
            qr = slide.shapes.add_picture(s['qr'], px(1524), px(695), px(300), px(300))
            qr.name = 'Cod QR'
            qr._element.nvPicPr.cNvPr.set('descr', 'Cod QR către ' + s['cta'])
        if m['rule']:
            r = m['rule']
            rule = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, px(r['x']), px(r['y']), px(r['w']), px(r['h']))
            rule.adjustments[0] = 0.5
            rule.name = 'Linie'
            solid(rule, accent)
        if m['logo']:
            b = m['logo']
            pic = slide.shapes.add_picture(logo, px(b['x']), px(b['y']), px(b['w']), px(b['h']))
            pic.name = 'Logo'
            pic._element.nvPicPr.cNvPr.set('descr', 'Logo CropCash')
        if m['footer']:
            add_text(slide, m['footer'], 'Subsol', bold=False)
        if m['footerLogo']:
            b = m['footerLogo']
            pic = slide.shapes.add_picture(logo, px(b['x']), px(b['y']), px(b['w']), px(b['h']))
            pic.name = 'Logo subsol'
            pic._element.nvPicPr.cNvPr.set('descr', 'Logo CropCash')
        if plan['demos']:
            demo = next(iter(plan['demos'].values()))
            add_browser_frame(slide, m)
            slot = m['slot']
            gif = make_gif(demo, slot, os.path.join(gifs, f"{s['id']}.gif"))
            pic = slide.shapes.add_picture(gif, px(slot['x']), px(slot['y']), px(slot['w']), px(slot['h']))
            pic.name = f"Demo {s['id']}"
            pic._element.nvPicPr.cNvPr.set('descr', s.get('alt') or f"Demonstrație în aplicație: {spec['text']}".replace('\n', ' '))
            print(f"gif {s['id']}: {os.path.getsize(gif) // 1024} KB")
        set_fade(slide)
        if s.get('notes'):
            slide.notes_slide.notes_text_frame.text = s['notes'].strip()
    out = deck.p(OUT)
    prs.save(out)
    return out


def verify(path, deck):
    """Every demo slide has one looping animated GIF; no video; titles, notes, alt text and fades are there."""
    problems = []
    prs = Presentation(path)
    with zipfile.ZipFile(path) as z:
        media = [n for n in z.namelist() if n.startswith('ppt/media/')]
        if any(n.lower().endswith(('.mp4', '.mov', '.m4v')) for n in media):
            problems.append('deck still contains video')
    if len(prs.slides) != len(deck.slides):
        problems.append(f'{len(prs.slides)} slides, expected {len(deck.slides)}')
    for i, (slide, s) in enumerate(zip(prs.slides, deck.slides), 1):
        if not (slide.shapes.title and slide.shapes.title.text_frame.text.strip()):
            problems.append(f'slide {i}: no title')
        if s.get('notes') and not (slide.has_notes_slide and slide.notes_slide.notes_text_frame.text.strip()):
            problems.append(f'slide {i}: notes missing')
        if b'p14:dur' not in etree.tostring(slide._element):
            problems.append(f'slide {i}: no fade')
        gifs = [p for p in slide.shapes if p.shape_type == 13 and p.image.ext == 'gif']
        wanted = 1 if (s.get('demo') or s.get('demos')) else 0
        if len(gifs) != wanted:
            problems.append(f'slide {i}: {len(gifs)} GIFs, expected {wanted}')
        for g in gifs:
            im = Image.open(io.BytesIO(g.image.blob))
            if getattr(im, 'n_frames', 1) < 2:
                problems.append(f'slide {i}: GIF is not animated')
            if im.info.get('loop') != 0:
                problems.append(f'slide {i}: GIF does not loop forever')
            if not g._element.nvPicPr.cNvPr.get('descr'):
                problems.append(f'slide {i}: GIF has no alt text')
            print(f'slide {i}: {im.n_frames} frames, {im.size[0]}x{im.size[1]}, {len(g.image.blob) // 1024} KB')
    print(f'{os.path.basename(path)}: {len(prs.slides)} slides, {os.path.getsize(path) / 1048576:.1f} MB')
    if problems:
        print('PROBLEMS:\n  - ' + '\n  - '.join(problems))
        return 1
    print('OK: demo slides have looping GIFs, no video, titles, notes, alt text and fades')
    return 0


if __name__ == '__main__':
    OUT = sys.argv[1] if len(sys.argv) > 1 else OUT  # another name, e.g. while the deck is open in PowerPoint
    d = make_deck.Deck(os.path.join(HERE, 'storyboard.yaml'))
    sys.exit(verify(build(d), d))
