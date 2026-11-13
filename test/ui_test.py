import asyncio, json, sys
from playwright.async_api import async_playwright

URL = 'file:///home/claude/songgiggin/dist/index.html'
OUT = '/home/claude/shots/'

async def save_then(page, sel):
    if await page.locator('#ed-save').count() and not await page.is_disabled('#ed-save'):
        await page.click('#ed-save')
    await page.click(sel)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1180, 'height': 820}, color_scheme='dark', locale='en-US')
        page = await ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)
        await page.goto(URL)
        await page.wait_for_selector('.rows .row')
        rows = await page.locator('.rows .row').count()
        print('pool rows:', rows, '| sync:', await page.locator('#sync').get_attribute('data-s'))
        await page.screenshot(path=OUT + '1-pool-dark.png')

        # setlist detail
        await save_then(page, '#tab-setlists')
        await page.click('.listcard')
        await page.wait_for_selector('.setsongs li')
        keys = await page.locator('.setsongs li .keys').all_inner_texts()
        print('setlist keys:', [k.replace('\n', ' ') for k in keys])
        # raise key of song 1 (G -> Ab), then lower back
        await page.locator('.setsongs li').nth(0).get_by_label('Raise the key by a semitone').click()
        print('after +1:', (await page.locator('.setsongs li .keys').nth(0).inner_text()).replace('\n', ' '))
        await page.locator('.setsongs li').nth(0).get_by_label('Lower the key by a semitone').click()
        # reorder: move song 1 down
        await page.locator('.setsongs li').nth(0).get_by_label('Move down').click()
        print('order:', await page.locator('.setsongs li .open b').all_inner_texts())
        await page.locator('.setsongs li').nth(1).get_by_label('Move up').click()
        await page.screenshot(path=OUT + '2-setlist-dark.png')

        # stage from setlist, song 3 (Amazing Grace, +2 -> A)
        await page.locator('.setsongs li .open').nth(2).click()
        await page.wait_for_selector('#stage .sheet-body')
        print('stage keys:', (await page.locator('#stage .keys').inner_text()).replace('\n', ' '))
        chords = await page.locator('#stage .ch').all_inner_texts()
        print('stage chords:', [c for c in chords if c.strip()][:8])
        # speed + twice, play, check scroll moves
        await page.get_by_label('Faster').click(); await page.get_by_label('Faster').click()
        print('speed:', await page.locator('.transport .play b').inner_text())
        await page.set_viewport_size({'width': 900, 'height': 420})
        await page.locator('.transport .play').click()
        await page.wait_for_timeout(1500)
        top = await page.evaluate("document.getElementById('stage-sheet').scrollTop")
        print('scrollTop after 1.5s:', round(top, 1))
        await page.keyboard.press('Space')
        await page.wait_for_timeout(200)
        t1 = await page.evaluate("document.getElementById('stage-sheet').scrollTop")
        await page.wait_for_timeout(400)
        t2 = await page.evaluate("document.getElementById('stage-sheet').scrollTop")
        print('paused by space:', t1 == t2)
        await page.set_viewport_size({'width': 1180, 'height': 820})
        await page.evaluate("document.getElementById('stage-sheet').scrollTop = 0")
        await page.screenshot(path=OUT + '3-stage-dark.png')
        # prev song via arrow key
        await page.keyboard.press('ArrowLeft')
        print('prev title:', await page.locator('.sttitle b').inner_text())
        await page.wait_for_timeout(1100)
        await page.keyboard.press('Escape')
        saved = await page.evaluate("JSON.parse(localStorage.getItem('songgiggin.data.v1')).songs['ex-amazing-grace'].speed")
        print('saved speed on song:', saved)
        # reopen the same song from the pool: speed should come back
        await save_then(page, '#tab-songs')
        await page.locator('.rows .row .open', has_text='Amazing Grace').click()
        print('speed on reopen:', await page.locator('.transport .play b').inner_text(), '| keys:', (await page.locator('#stage .keys').inner_text()).replace('\n', ' '))
        await page.keyboard.press('Escape')

        # editor: new song, paste-like conversion via Convert button, chord nudge
        await page.get_by_role('button', name='New song').click()
        await page.fill('#ed-title', 'Test lag')
        await page.fill('#ed-key', 'em')
        await page.fill('#ed-body', 'Em       C\nHello my friend\nG  D\nplain end')
        await page.get_by_role('button', name='Convert chords above lyrics').click()
        body = await page.input_value('#ed-body')
        print('converted:', json.dumps(body))
        await page.evaluate("(() => { const t = document.getElementById('ed-body'); t.focus(); t.setSelectionRange(1, 1); })()")
        await page.get_by_label('Move chord right').click()
        await page.get_by_label('Move chord right').click()
        print('nudged:', json.dumps((await page.input_value('#ed-body')).split('\n')[0]))
        await page.wait_for_timeout(900)
        print('status:', await page.locator('#ed-status').inner_text(), '| key field:', await page.input_value('#ed-key'))
        await page.screenshot(path=OUT + '4-editor-dark.png')
        await save_then(page, '#tab-songs')
        print('pool rows now:', await page.locator('.rows .row').count())

        # Icelandic + light
        await page.click('#btn-settings')
        await page.get_by_role('button', name='Íslenska').click()
        await page.get_by_role('button', name='Ljóst').click()
        await page.get_by_role('button', name='Lokið').click()
        print('heading IS:', await page.locator('.pagehead h1').inner_text(), '|', await page.locator('.pagehead .count').inner_text())
        await page.screenshot(path=OUT + '5-pool-light-is.png')

        # phone size stage
        await page.set_viewport_size({'width': 390, 'height': 780})
        await page.locator('.rows .row .open', has_text='House of the Rising Sun').click()
        await page.wait_for_selector('#stage .sheet-body')
        await page.screenshot(path=OUT + '6-stage-phone-light.png')
        ov = await page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
        print('page overflows sideways on phone:', ov)
        await page.keyboard.press('Escape')
        await page.screenshot(path=OUT + '7-pool-phone.png')

        # reload: data persists
        await page.reload()
        await page.wait_for_selector('.rows .row')
        print('rows after reload:', await page.locator('.rows .row').count())
        print('ERRORS:', errors)
        await b.close()

asyncio.run(main())
