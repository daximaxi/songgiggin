import asyncio, json
from playwright.async_api import async_playwright
URL = 'file:///home/claude/songgiggin/dist/index.html'

def line_box(page, text):
    return page.evaluate("""(t) => { const el = [...document.querySelectorAll('#stage [data-bi]')].find(e => e.getAttribute('data-k') === 'l:' + t.toLowerCase());
      const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }""", text)
STROKE_BOX = """() => { const p = document.querySelector('#stage .notes-svg g path'); if (!p) return null; const r = p.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }"""

async def draw(page, x0, y, x1):
    await page.mouse.move(x0, y); await page.mouse.down()
    for k in range(1, 11): await page.mouse.move(x0 + (x1 - x0) * k / 10, y + (3 if k % 2 else -3))
    await page.mouse.up()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        page = await (await b.new_context(viewport={'width': 1100, 'height': 860}, color_scheme='light', locale='is-IS')).new_page()
        errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(URL); await page.wait_for_selector('.rows .row')
        await page.locator('.rows .row .open', has_text='Amazing Grace').click()
        await page.wait_for_selector('#stage .sheet-body')
        print('eye hidden with no notes:', await page.locator('#stage .sttop [aria-label="Fela glósur"]').is_hidden())
        await page.get_by_role('button', name='Glósur', exact=True).click()
        print('toolbar shown:', await page.locator('.notesbar').is_visible())
        L = 'That saved a wretch like me'
        x, y, w, h = await line_box(page, L)
        await draw(page, x + 20, y + h - 8, x + 220)            # underline the line with the red pen
        await page.get_by_label('Yfirstrikun').click()
        x2, y2, w2, h2 = await line_box(page, 'Was blind, but now I see')
        await draw(page, x2, y2 + h2 - 12, x2 + 160)             # highlight another line
        await page.get_by_label('Texti', exact=True).click()
        await page.mouse.click(x + 300, y + h - 10)
        await page.keyboard.type('hægar hér'); await page.keyboard.press('Enter')
        notes = await page.evaluate("document.querySelectorAll('#stage .notes-svg g').length + document.querySelectorAll('#stage .note-text').length")
        print('notes drawn:', notes)
        before = await page.evaluate(STROKE_BOX)
        rel = [round(before[0] - x), round(before[1] - y)]
        await page.screenshot(path='/home/claude/shots/v3-drawing.png')
        # leaving with unsaved notes asks first
        await page.keyboard.press('Escape')
        print('guard:', await page.locator('dialog h2').inner_text())
        await page.get_by_role('button', name='Hætta við').click()
        await page.get_by_role('button', name='Lokið').click()
        await page.wait_for_timeout(400)
        saved = await page.evaluate("JSON.parse(localStorage.getItem('songgiggin.data.v1')).songs['ex-amazing-grace'].notes")
        print('saved notes:', [n['type'] for n in saved], '| anchored to:', saved[0]['a'])
        # reload and reopen: same place relative to the line
        await page.reload(); await page.wait_for_selector('.rows .row')
        await page.locator('.rows .row .open', has_text='Amazing Grace').click(); await page.wait_for_selector('#stage .notes-svg g')
        x, y, w, h = await line_box(page, L); after = await page.evaluate(STROKE_BOX)
        print('offset from line before/after reload:', rel, [round(after[0] - x), round(after[1] - y)])
        # transpose and bigger text: still on the same line, scaled with the text
        await page.get_by_label('Hækka tóntegund um hálftón').click()
        await page.get_by_label('Stærra letur').click(); await page.get_by_label('Stærra letur').click()
        await page.wait_for_timeout(100)
        x, y, w, h = await line_box(page, L); big = await page.evaluate(STROKE_BOX)
        print('after transpose and +4px text: stroke top inside line box:', y <= big[1] <= y + h, '| width', round(before[2]), '->', round(big[2]))
        # hide and show
        await page.get_by_label('Fela glósur').click()
        print('hidden:', await page.evaluate("document.querySelectorAll('#stage .notes-svg g').length"))
        await page.get_by_label('Sýna glósur').click()
        print('shown:', await page.evaluate("document.querySelectorAll('#stage .notes-svg g').length"))
        # add a line above it in the editor: the note follows its line
        await page.get_by_label('Breyta lagi').click()
        body = await page.input_value('#ed-body')
        await page.fill('#ed-body', 'Ný lína efst\nÖnnur ný lína\n' + body)
        await page.click('#ed-save'); await page.get_by_role('button', name='Aftur á svið').click()
        await page.wait_for_selector('#stage .notes-svg g')
        x, y, w, h = await line_box(page, L); moved = await page.evaluate(STROKE_BOX)
        print('after adding lines above: stroke still on its line:', y <= moved[1] <= y + h)
        # eraser removes one stroke, undo brings it back
        await page.get_by_role('button', name='Glósur', exact=True).click()
        await page.get_by_label('Strokleður').click()
        moved = await page.evaluate(STROKE_BOX)
        cnt0 = await page.evaluate("document.querySelectorAll('#stage .notes-svg g').length")
        await page.mouse.click(moved[0] + moved[2] / 2, moved[1] + moved[3] / 2)
        cnt1 = await page.evaluate("document.querySelectorAll('#stage .notes-svg g').length")
        await page.keyboard.press('Control+z')
        cnt2 = await page.evaluate("document.querySelectorAll('#stage .notes-svg g').length")
        print('erase / undo counts:', cnt0, cnt1, cnt2)
        # two-finger style scroll with touch pointers does not draw
        top0 = await page.evaluate("document.getElementById('stage-sheet').scrollTop")
        await page.evaluate("""() => { const l = document.querySelector('#stage .notes-layer'); const r = l.getBoundingClientRect();
          const ev = (type, id, y) => l.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: r.left + 100, clientY: y, bubbles: true, isPrimary: id === 11 }));
          ev('pointerdown', 11, 500); ev('pointerdown', 12, 520); for (let k = 1; k <= 10; k++) { ev('pointermove', 11, 500 - k * 20); ev('pointermove', 12, 520 - k * 20); } ev('pointerup', 11, 300); ev('pointerup', 12, 320); }""")
        top1 = await page.evaluate("document.getElementById('stage-sheet').scrollTop")
        cnt3 = await page.evaluate("document.querySelectorAll('#stage .notes-svg g').length")
        print('two finger scroll moved page:', top1 > top0, '| strokes unchanged:', cnt3 == cnt2)
        await page.get_by_role('button', name='Lokið').click()
        await page.screenshot(path='/home/claude/shots/v3-after.png')
        await page.set_viewport_size({'width': 390, 'height': 800}); await page.get_by_role('button', name='Glósur', exact=True).click()
        await page.screenshot(path='/home/claude/shots/v3-phone.png')
        print('ERRORS:', errors)
        await b.close()
asyncio.run(main())
