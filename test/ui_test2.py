import asyncio, json
from playwright.async_api import async_playwright
URL = 'file:///home/claude/songgiggin/dist/index.html'
OUT = '/home/claude/shots/v11-'
UG = """Northern Road Chords by The Test Band
Difficulty: novice
Key: G
Capo: 2

[Verse 1]
G                D
Walking down the northern road
Em              C
Thinking of the way back home

[Chorus]
C    G
Oh la la
"""

async def save_then(page, sel):
    if await page.locator('#ed-save').count() and not await page.is_disabled('#ed-save'):
        await page.click('#ed-save')
    await page.click(sel)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1180, 'height': 860}, color_scheme='dark', locale='is-IS')
        page = await ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        await page.goto(URL)
        await page.wait_for_selector('.rows .row')
        print('lang:', await page.locator('.pagehead h1').inner_text())
        print('filter chips:', await page.locator('.tagfilter .tagchip').all_inner_texts())
        print('groups (title):', await page.locator('.grouphead span').all_inner_texts())
        await page.select_option('#pool-sort', 'tags')
        print('groups (tags):', await page.locator('.grouphead').all_inner_texts())
        await page.select_option('#pool-sort', 'artist')
        print('groups (artist):', [g.replace('\n', ' ') for g in await page.locator('.grouphead').all_inner_texts()])
        await page.locator('.tagfilter .tagchip', has_text='Rólegt').click()
        print('filtered rows:', await page.locator('.rows .row .t b').all_inner_texts())
        await page.locator('.tagfilter button', has_text='Hreinsa').click()

        # import
        await page.get_by_role('button', name='Flytja inn').first.click()
        await page.fill('#import-text', UG)
        await page.screenshot(path=OUT + '1-import.png')
        await page.locator('dialog .btn.primary').click()
        await page.wait_for_selector('#ed-body')
        print('imported:', await page.input_value('#ed-title'), '|', await page.input_value('#ed-artist'), '|', await page.input_value('#ed-key'))
        print('body:', json.dumps((await page.input_value('#ed-body')).split('\n')[:5]))
        # tag it, create a new tag
        await page.locator('.tagrow .tagchip', has_text='Erlent').click()
        await page.fill('#ed-newtag', "80's")
        await page.keyboard.press('Enter')
        print('editor tags on:', await page.locator('.tagrow .tagchip[aria-pressed="true"]').all_inner_texts())
        await page.wait_for_timeout(900)
        await page.screenshot(path=OUT + '2-editor.png')
        await save_then(page, '#tab-songs')
        await page.select_option('#pool-sort', 'title')
        print('rows:', await page.locator('.rows .row .t b').all_inner_texts())
        print('row sub:', await page.locator('.row', has_text='Northern Road').locator('small').inner_text())

        # setlists: sort + dates, new setlist
        await save_then(page, '#tab-setlists')
        await page.get_by_role('button', name='Nýr lagalisti').click()
        await page.fill('#setlist-name', 'Árshátíð')
        await page.wait_for_timeout(800)
        print('detail meta:', await page.locator('.sethead .count').inner_text())
        await page.get_by_role('button', name='Bæta við lögum').click()
        await page.locator('dialog .item', has_text='Northern Road').get_by_role('button').click()
        await page.locator('dialog .item', has_text='Amazing Grace').get_by_role('button').click()
        await page.get_by_role('button', name='Lokið').click()
        await page.locator('.sethead .btn.ghost').first.click()
        print('cards (created):', await page.locator('.listcard b').all_inner_texts())
        await page.select_option('#setlist-sort', 'name')
        print('cards (A-Ö):', await page.locator('.listcard b').all_inner_texts())
        print('card small:', await page.locator('.listcard').first.locator('small').all_inner_texts())
        await page.screenshot(path=OUT + '3-setlists.png')

        # stage -> edit -> back to stage
        await page.locator('.listcard', has_text='Árshátíð').click()
        await page.locator('.setsongs li .open').nth(1).click()
        await page.wait_for_selector('#stage .sheet-body')
        await page.evaluate("document.getElementById('stage-sheet').scrollTop = 120")
        await page.locator('#stage').get_by_label('Breyta lagi').click()
        await page.wait_for_selector('#ed-body')
        print('editing:', await page.input_value('#ed-title'))
        await page.fill('#ed-artist', 'John Newton')
        await page.click('#ed-save'); await page.get_by_role('button', name='Aftur á svið').click()
        await page.wait_for_selector('#stage .sheet-body')
        print('back on stage:', await page.locator('.sttitle b').inner_text(), '|', await page.locator('.sttitle small').inner_text(),
              '| scroll', await page.evaluate("document.getElementById('stage-sheet').scrollTop"))
        await page.keyboard.press('Escape')
        print('view after close:', await page.locator('.sethead .name').input_value())

        # colour
        await page.click('#btn-settings')
        await page.get_by_role('button', name='Blár', exact=True).click()
        acc = await page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent')")
        print('accent blue (dark):', acc)
        await page.get_by_role('button', name='Ljóst').click()
        print('accent blue (light):', await page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent')"))
        await page.screenshot(path=OUT + '4-settings.png')
        # rename a tag
        tagin = page.locator('dialog .taglist .item input').first
        await tagin.fill('Íslenskt efni'); await tagin.press('Tab')
        await page.get_by_role('button', name='Lokið').click()
        await save_then(page, '#tab-songs')
        print('chips after rename:', await page.locator('.tagfilter .tagchip').all_inner_texts())
        await page.screenshot(path=OUT + '5-pool-light-blue.png')
        await page.set_viewport_size({'width': 390, 'height': 800})
        await page.screenshot(path=OUT + '6-pool-phone.png')
        print('phone overflow:', await page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))
        await page.reload(); await page.wait_for_selector('.rows .row')
        print('after reload rows:', await page.locator('.rows .row').count(), '| accent', await page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent')"))
        print('ERRORS:', errors)
        await b.close()
asyncio.run(main())
