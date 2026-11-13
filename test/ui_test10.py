"""v3.5: GIGGARI name and wordmark, archive instead of delete."""
import asyncio
from playwright.async_api import async_playwright
URL = 'file:///home/claude/songgiggin/dist/index.html'
DATA = "JSON.parse(localStorage.getItem('songgiggin.data.v1'))"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        page = await (await b.new_context(viewport={'width': 1100, 'height': 860}, color_scheme='dark', locale='is-IS')).new_page()
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(URL); await page.wait_for_selector('.rows .row')
        print('title:', await page.title(), '| brand:', await page.inner_text('#brand'))
        print('no old name on screen:', 'songgiggin' not in (await page.evaluate('document.body.innerText')).lower())

        # archive a song from the pool
        await page.locator('.rows .row', has_text='House of the Rising Sun').get_by_label('Setja í geymslu').click()
        print('toast:', await page.inner_text('#toast'))
        print('gone from pool:', await page.locator('.rows .row', has_text='House of the Rising Sun').count() == 0)
        # it stays on the example setlist and is marked
        await page.click('#tab-setlists'); await page.click('.listcard')
        on_list = page.locator('ol li', has_text='House of the Rising Sun')
        print('still on setlist:', await on_list.count() == 1, '| marked:', await on_list.locator('.tag.arch').inner_text() if await on_list.count() else None)
        # archive the setlist
        await page.get_by_role('button', name='Setja í geymslu').click()
        print('setlists left:', await page.locator('.listcard').count())
        # open the archive
        await page.locator('.archbtn').click()
        print('archive rows:', await page.locator('.archrow').count(), '| hash:', await page.evaluate('location.hash'))
        await page.screenshot(path='/home/claude/shots/v35-archive.png')
        # restore the setlist
        await page.locator('.archrow', has_text='Dæmi um gigg').get_by_role('button', name='Sækja aftur').click()
        print('after restore rows:', await page.locator('.archrow').count())
        # delete the song for good: asks first, cancel keeps it
        await page.locator('.archrow', has_text='House of the Rising Sun').get_by_role('button', name='Eyða endanlega').click()
        print('confirm:', await page.inner_text('dialog h2'), '|', await page.inner_text('dialog .hint'))
        await page.get_by_role('button', name='Hætta við').click()
        print('kept after cancel:', await page.locator('.archrow').count())
        await page.locator('.archrow', has_text='House of the Rising Sun').get_by_role('button', name='Eyða endanlega').click()
        await page.locator('dialog').get_by_role('button', name='Eyða endanlega').click()
        await page.wait_for_timeout(500); d = await page.evaluate(DATA)
        hr = [s for s in d['songs'].values() if s['title'].startswith('House')][0]
        print('deleted for good:', hr.get('deleted'), '| archive empty:', await page.locator('.empty').count() == 1)
        # undo from the toast after archiving from the pool
        await page.click('#tab-songs')
        await page.locator('.rows .row', has_text='Oh! Susanna').get_by_label('Setja í geymslu').click()
        await page.locator('#toast button').click()
        print('undo restores:', await page.locator('.rows .row', has_text='Oh! Susanna').count() == 1)
        # export file name
        async with page.expect_download() as dl:
            await page.get_by_role('button', name='Flytja út').click()
            await page.locator('dialog').get_by_role('button', name='Hlaða niður').first.click()
        print('export name:', (await dl.value).suggested_filename)
        await page.keyboard.press('Escape')
        await page.screenshot(path='/home/claude/shots/v35-pool.png')
        print('ERRORS:', errs)
        await b.close()

asyncio.run(main())
