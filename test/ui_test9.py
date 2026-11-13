"""v3.4: save goes back, print on stage, chords button label, black theme, song text settings,
text notes can be edited and moved, straight highlighter lines."""
import asyncio, json
from playwright.async_api import async_playwright
URL = 'file:///home/claude/songgiggin/dist/index.html'
NOTES = "JSON.parse(localStorage.getItem('songgiggin.data.v1')).songs['ex-amazing-grace'].notes || []"

def line_box(page, text):
    return page.evaluate("""(t) => { const el = [...document.querySelectorAll('#stage [data-bi]')].find(e => e.getAttribute('data-k') === 'l:' + t.toLowerCase());
      const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }""", text)

async def wobbly(page, x0, y0, x1, y1):
    await page.mouse.move(x0, y0); await page.mouse.down()
    for k in range(1, 13): await page.mouse.move(x0 + (x1 - x0) * k / 12, y0 + (y1 - y0) * k / 12 + (4 if k % 2 else -4))
    await page.mouse.up()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        page = await (await b.new_context(viewport={'width': 1100, 'height': 860}, color_scheme='light', locale='is-IS')).new_page()
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(URL); await page.wait_for_selector('.rows .row')

        # 1. Save from the song pool goes back to the song pool
        await page.locator('.rows .row', has_text='Amazing Grace').get_by_label('Breyta').click()
        await page.wait_for_selector('#ed-save')
        print('editor has no print button:', await page.locator('.edhead [aria-label="Prenta / PDF"]').count() == 0)
        await page.fill('#ed-artist', 'John Newton')
        await page.click('#ed-save')
        await page.wait_for_selector('.rows .row')
        print('save went back to pool:', await page.locator('#ed-save').count() == 0)

        # 2. Save from the stage goes back to the stage
        await page.locator('.rows .row .open', has_text='Amazing Grace').click(); await page.wait_for_selector('#stage .sheet-body')
        await page.get_by_label('Breyta lagi').click(); await page.wait_for_selector('#ed-save')
        ta = page.locator('textarea').first
        await ta.focus(); await page.keyboard.press('Control+End'); await page.keyboard.type('\n')
        await page.click('#ed-save')
        await page.wait_for_timeout(300)
        print('save went back to stage:', await page.locator('#stage').is_visible())

        # 3. Chords button says what it does; print sits on the stage
        btn = page.locator('#stage .chordsbtn')
        a = await btn.inner_text(); await btn.click(); b2 = await btn.inner_text(); await btn.click()
        print('chords button:', a, '->', b2)
        print('print on stage:', await page.locator('#stage .sttop [aria-label="Prenta / PDF"]').is_visible())
        await page.locator('#stage .sttop [aria-label="Prenta / PDF"]').click()
        print('print dialog chords default:', await page.locator('dialog .seg button[aria-pressed="true"]', has_text='Með hljómum').count() == 1)
        await page.get_by_role('button', name='Hætta við').click()

        # 4. Text note: add, edit by tap, move by drag
        await page.get_by_role('button', name='Glósur', exact=True).click()
        await page.get_by_label('Texti', exact=True).click()
        x, y, w, h = await line_box(page, 'That saved a wretch like me')
        await page.mouse.click(x + 300, y + h - 10)
        await page.keyboard.type('hægar'); await page.keyboard.press('Enter')
        el = page.locator('#stage .note-text').first
        bx = await el.bounding_box()
        await page.mouse.click(bx['x'] + 5, bx['y'] + bx['height'] / 2)
        await page.keyboard.press('Control+A'); await page.keyboard.type('hægar hér'); await page.keyboard.press('Enter')
        print('edited text:', await el.inner_text())
        x2, y2, w2, h2 = await line_box(page, 'Was blind, but now I see')
        bx = await el.bounding_box()
        await page.mouse.move(bx['x'] + 5, bx['y'] + bx['height'] / 2); await page.mouse.down()
        await page.mouse.move(x2 + 200, y2 + 5, steps=8); await page.mouse.up()
        # 5. Straight highlighter
        await page.get_by_label('Yfirstrikun').click()
        await page.get_by_label('Yfirstrikun dregur beinar línur, lárétt eða lóðrétt').click()
        x3, y3, w3, h3 = await line_box(page, 'I once was lost, but now am found')
        await wobbly(page, x3, y3 + h3 - 10, x3 + 220, y3 + h3 - 4)
        await page.get_by_role('button', name='Lokið').click(); await page.wait_for_timeout(400)
        notes = await page.evaluate(NOTES)
        tx = [n for n in notes if n['type'] == 'text'][0]
        print('text note:', tx['text'], '| anchored to:', tx['a']['k'])
        hl = [n for n in notes if n['type'] == 'hl'][-1]
        ys = set(p_[1] for p_ in hl['pts'])
        print('straight highlight points:', len(hl['pts']), '| one y value:', len(ys) == 1)

        # 6. Black theme and text settings
        await page.keyboard.press('Escape')
        await page.click('#btn-settings')
        await page.locator('dialog .seg button', has_text='Svart').click()
        await page.locator('dialog .textset .seg button', has_text='Kerfisletur').click()
        await page.locator('dialog label.check', has_text='Feitur texti').click()
        await page.locator('dialog label.check', has_text='Highlight').click()
        await page.locator('dialog .textset .swatch[aria-label="Blár"]').click()
        await page.get_by_role('button', name='Lokið').click()
        await page.locator('.rows .row .open', has_text='Amazing Grace').click(); await page.wait_for_selector('#stage .sheet-body')
        st = await page.evaluate("""(() => { const c = document.querySelector('#stage .ch[data-c]'), l = document.querySelector('#stage .sheet-body');
          return { bg: getComputedStyle(document.getElementById('stage')).backgroundColor, chord: getComputedStyle(c).color, hi: getComputedStyle(c).backgroundColor,
            font: getComputedStyle(l).fontFamily.slice(0, 20), weight: getComputedStyle(l).fontWeight,
            meta: [...document.querySelectorAll('meta[name=theme-color]')].map(m => m.content) }; })()""")
        print('black theme:', st)
        await page.screenshot(path='/home/claude/shots/v34-test-stage.png')
        print('ERRORS:', errs)
        await b.close()

asyncio.run(main())
