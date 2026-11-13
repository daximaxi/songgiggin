import asyncio, json
from playwright.async_api import async_playwright
URL = 'file:///home/claude/songgiggin/dist/index.html'
# Guitarparty style markup. The chord-only line is the real structure; lyric lines are a guess at the same pattern.
CH = lambda c: f'<strong class="open-chords" data-chord="{c}"><span>[</span>{c}<span>]</span></strong>'
GP_HTML = f'''<h1>Lagið mitt</h1>
<div class="credits">Höfundur lags: <a href="#">Jón Jónsson</a>, Höfundur texta: <a href="#">Gunna</a>, Flytjandi: <a href="#">Bandið góða</a>,</div>
<div class="chordline">
\t<span></span><span style="margin-right:15px;">{CH("A")}&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="margin-right:65px;">{CH("C#m/G#")}&nbsp;&nbsp;&nbsp;&nbsp;</span><span>{CH("F#m")}&nbsp;&nbsp;</span><span></span>
</div>
<div class="chordline"><span>Hér er ég og </span><span>{CH("A")}syng um</span><span> eitt</span></div>
<div class="chordline"><span>og </span><span>{CH("C#m/G#")}fer&nbsp;&nbsp;&nbsp;&nbsp;svo heim í </span><span>{CH("F#m")}kvöld</span></div>
<p></p>
<div class="chordline"><span>{CH("Bm")}Ný lína </span><span>{CH("E")}hér</span></div>'''
GP_TEXT = 'Lagið mitt\nA\nC#m/G#\nF#m\nHér er ég og\nA\nsyng um eitt'
UG_TEXT = 'Test Song Chords by Some Band\n1,234 views12 saves\nAuthor: UnregisteredDifficulty: Beginner\nTuning: E A D G B EKey: GCapo: No capo\n\n[Verse 1]\nG        C\nHello there my friend\n'

PASTE = '''([sel, html, text]) => {
  const el = document.querySelector(sel); el.focus();
  const dt = new DataTransfer(); if (html) dt.setData('text/html', html); dt.setData('text/plain', text);
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  const ok = el.dispatchEvent(ev);
  if (ok) { el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); }
}'''

async def save_then(page, sel):
    if await page.locator('#ed-save').count() and not await page.is_disabled('#ed-save'):
        await page.click('#ed-save')
    await page.click(sel)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        page = await (await b.new_context(viewport={'width': 1180, 'height': 860}, color_scheme='dark', locale='is-IS')).new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(URL); await page.wait_for_selector('.rows .row')

        # 1. Flytja inn with formatted copy
        await page.get_by_role('button', name='Flytja inn').first.click()
        await page.evaluate(PASTE, ['#import-text', GP_HTML, GP_TEXT])
        print('dialog text:\n' + await page.input_value('#import-text'))
        await page.locator('dialog .btn.primary').click()
        await page.wait_for_selector('#ed-body')
        print('fields:', await page.input_value('#ed-title'), '|', await page.input_value('#ed-artist'), '|', await page.input_value('#ed-key'))
        print('body:', json.dumps(await page.input_value('#ed-body')))
        await page.wait_for_timeout(900)

        # 2. New song, paste UG text straight into the empty editor
        await save_then(page, '#tab-songs')
        await page.get_by_role('button', name='Nýtt lag').click()
        await page.evaluate(PASTE, ['#ed-body', None, UG_TEXT])
        print('editor UG:', await page.input_value('#ed-title'), '|', await page.input_value('#ed-artist'), '|', await page.input_value('#ed-key'))
        print('editor UG body:', json.dumps(await page.input_value('#ed-body')))
        await page.wait_for_timeout(900)

        # 2b. Lyrics without chords into an empty editor
        await save_then(page, '#tab-songs')
        await page.get_by_role('button', name='Nýtt lag').click()
        await page.evaluate(PASTE, ['#ed-body', None, 'Lagið um kisu\nJón J / 03/07/2024\nLagið um kisu\n(Lag og texti: Anna Jónsdóttir)\nKisa mín er grá\nog hún sefur hjá mér.'])
        print('editor lyrics:', await page.input_value('#ed-title'), '|', await page.input_value('#ed-artist'), '|', json.dumps(await page.input_value('#ed-body')))
        await page.wait_for_timeout(900)

        # 3. Artist suggestions
        await save_then(page, '#tab-songs')
        await page.get_by_role('button', name='Nýtt lag').click()
        opts = await page.evaluate("[...document.querySelectorAll('#artist-list option')].map(o => o.value)")
        print('artist suggestions:', opts, '| input list attr:', await page.get_attribute('#ed-artist', 'list'))

        # 4. Pasting into a non-empty editor only converts
        await page.fill('#ed-body', 'Fyrsta lína\n')
        await page.evaluate("document.getElementById('ed-body').setSelectionRange(12, 12)")
        await page.evaluate(PASTE, ['#ed-body', None, 'G    C\nla la la'])
        print('append:', json.dumps(await page.input_value('#ed-body')), '| title stays empty:', repr(await page.input_value('#ed-title')))
        print('ERRORS:', errors)
        await b.close()
asyncio.run(main())
