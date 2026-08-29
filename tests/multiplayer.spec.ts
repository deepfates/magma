import {expect, test, type BrowserContext, type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const blockRemoteMedia = (context: BrowserContext) => context.route(/(youtube(?:-nocookie)?\.com|googlevideo\.com|ytimg\.com)/, (route) => route.abort());

const enterAs = async (page: Page, name: string, intention: string) => {
  await page.getByRole('button', {name: 'Room', exact: true}).click();
  await page.getByRole('button', {name: 'Edit your profile'}).click();
  await page.getByLabel('Name', {exact: true}).fill(name);
  await page.getByLabel('Today’s intention').fill(intention);
  await page.getByRole('button', {name: 'Close profile editor'}).click();
  await page.locator('.tool-dock').getByRole('button', {name: 'Focus'}).click();
};

test('two people share an authoritative clock and merge their workspace', async ({browser}) => {
  const room = `test-${crypto.randomUUID()}`;
  const firstContext = await browser.newContext();
  const first = await firstContext.newPage();
  await first.goto(`/?room=${room}`);
  await expect(first.getByText('you hold the room tempo')).toBeVisible();
  await enterAs(first, 'Ada', 'Ship one honest thing');

  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  await second.goto(`/?room=${room}`);
  await enterAs(second, 'Linus', 'Keep the clock humane');
  await expect(first.getByRole('button', {name: 'Open Room, 2 people in room'})).toBeVisible();
  await expect(first.locator('.room-locus small')).toHaveText('2 in room');
  await first.getByRole('button', {name: 'Room', exact: true}).click();
  await expect(first.getByText('2 people')).toBeVisible();
  await first.locator('.tool-dock').getByRole('button', {name: 'Focus'}).click();
  await expect(second.getByText('Ada holds the tempo')).toBeVisible();

  await first.getByRole('button', {name: 'Start together'}).click();
  await expect(first.getByRole('button', {name: 'Pause together'})).toBeVisible();
  await expect(second.getByRole('button', {name: 'Ask to pause'})).toBeVisible();

  await second.getByRole('button', {name: 'Ask to pause'}).click();
  await expect(first.getByText('Linus asks to pause')).toBeVisible();
  await first.getByRole('button', {name: 'Allow'}).click();
  await expect(first.getByRole('button', {name: 'Resume together'})).toBeVisible();
  await expect(second.getByRole('button', {name: 'Ask to resume'})).toBeVisible();

  await first.getByRole('button', {name: 'Workspace'}).click();
  await second.getByRole('button', {name: 'Workspace'}).click();
  await first.getByPlaceholder('What are we making real?').fill('Shape the ritual');
  await first.getByRole('button', {name: 'Add intention'}).click();
  await second.getByPlaceholder('What are we making real?').fill('Test the seam');
  await second.getByRole('button', {name: 'Add intention'}).click();
  await expect(first.getByText('Test the seam')).toBeVisible();
  await expect(second.getByText('Shape the ritual')).toBeVisible();

  await second.getByRole('tab', {name: /Sparks/}).click();
  await second.getByPlaceholder('Leave a spark for the room').fill('Silence can be collaborative.');
  await second.getByRole('button', {name: 'Add room note'}).click();
  await first.getByRole('tab', {name: /Sparks/}).click();
  await expect(first.getByText('Silence can be collaborative.')).toBeVisible();

  await first.reload();
  await first.getByRole('button', {name: 'Workspace'}).click();
  await expect(first.getByText('Shape the ritual')).toBeVisible();
  await expect(first.getByText('Test the seam')).toBeVisible();

  await firstContext.close();
  await second.locator('.tool-dock').getByRole('button', {name: 'Focus'}).click();
  await expect(second.getByText('you hold the room tempo')).toBeVisible();
  await expect(second.getByRole('button', {name: 'Resume together'})).toBeVisible();
  await secondContext.close();
});

test('a completed focus becomes one durable ember and starts the break', async ({page}) => {
  const room = `completion-${crypto.randomUUID()}`;
  await page.goto(`/?room=${room}`);
  await expect(page.getByText('you hold the room tempo')).toBeVisible();
  await page.getByRole('button', {name: 'Tempo'}).click();
  await page.getByRole('spinbutton', {name: 'Focus min'}).fill('0.5');
  await page.getByRole('button', {name: 'Set room cadence'}).click();
  await page.locator('.tool-dock').getByRole('button', {name: 'Focus'}).click();
  await page.getByRole('textbox', {name: 'Picture the finish line'}).fill('A verified Block');
  await page.getByRole('button', {name: 'Start together'}).click();

  await expect(page.getByRole('heading', {name: '1 minute held together.'})).toBeVisible({timeout: 36_000});
  await expect(page.getByRole('button', {name: 'Pause clock'})).toBeVisible();
  await page.getByRole('button', {name: 'Count this Block'}).click();
  await expect(page.getByText('Counted in today’s stack.')).toBeVisible();
  const dailyTally = await page.evaluate(() => JSON.parse(localStorage.getItem('magma:block-ritual') ?? '{}').tally);
  expect(dailyTally).toBe(1);
  const finishLine = await page.evaluate(() => JSON.parse(localStorage.getItem('magma:block-ritual') ?? '{}').finishLine);
  expect(finishLine).toBe('');
  await page.getByRole('button', {name: 'Close session ember'}).click();
  await expect(page.getByRole('button', {name: /Last ember/})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', {name: /Last ember/})).toHaveCount(1);
  await page.evaluate(() => {
    const ritual = JSON.parse(localStorage.getItem('magma:block-ritual') ?? '{}');
    localStorage.setItem('magma:block-ritual', JSON.stringify({...ritual, date: '2000-01-01', tally: 99}));
  });
  await page.reload();
  await page.getByRole('button', {name: /Last ember/}).click();
  await expect(page.getByRole('button', {name: 'Count this Block'})).toHaveCount(0);
  await expect(page.getByText('Counted in today’s stack.')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('magma:block-ritual') ?? '{}').tally)).toBe(0);
});

test('the Floor holds social activity, opens the Porch, and returns together', async ({browser}) => {
  test.setTimeout(105_000);
  const room = `porch-${crypto.randomUUID()}`;
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  await Promise.all([blockRemoteMedia(hostContext), blockRemoteMedia(guestContext)]);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto(`/?room=${room}`);
  await enterAs(host, 'Maya', 'Hold the threshold');
  await guest.goto(`/?room=${room}`);
  await enterAs(guest, 'Jules', 'Work quietly together');

  await host.getByRole('button', {name: 'Tempo'}).click();
  await host.getByRole('spinbutton', {name: 'Focus min'}).fill('0.5');
  await host.getByRole('spinbutton', {name: 'Short break min'}).fill('0.5');
  await host.getByRole('button', {name: 'Set room cadence'}).click();
  await host.locator('.tool-dock').getByRole('button', {name: 'Room', exact: true}).click();
  await host.getByRole('button', {name: 'Ready'}).click();
  await expect(guest.locator('.person').filter({hasText: 'Maya'}).locator('.posture')).toHaveText('ready');

  await host.locator('.tool-dock').getByRole('button', {name: 'Focus'}).click();
  await host.getByRole('button', {name: 'Start together'}).click();
  await host.locator('.tool-dock').getByRole('button', {name: 'Room', exact: true}).click();
  await guest.locator('.tool-dock').getByRole('button', {name: 'Room', exact: true}).click();
  await expect(host.getByText('Conversation is resting.')).toBeVisible();
  await expect(guest.locator('.person').filter({hasText: 'Jules'}).locator('.posture')).toHaveText('focusing');

  await guest.getByLabel('Leave a thought for the Porch').fill('A quiet thought for later');
  await guest.getByRole('button', {name: 'Hold for Porch'}).click();
  await expect(guest.getByLabel('Leave a thought for the Porch')).toHaveValue('');
  await guest.getByRole('button', {name: 'Send sparkles reaction'}).click();
  await guest.locator('.tool-dock').getByRole('button', {name: 'Environment', exact: true}).click();
  await expect(guest.getByRole('button', {name: 'Ritual cues off'})).toBeVisible();
  await expect(guest.getByRole('button', {name: 'Social sounds off'})).toBeVisible();
  await guest.getByRole('button', {name: /With you/}).click();
  await guest.getByRole('button', {name: 'Quiet everything'}).click();
  await expect(host.getByText('A quiet thought for later')).toHaveCount(0);
  await expect(host.locator('.social-bloom-visual')).toHaveCount(0);

  await expect(host.getByRole('heading', {name: '1 minute held together.'})).toBeVisible({timeout: 36_000});
  await expect(host.locator('.social-bloom-visual')).toBeVisible();
  await expect(host.locator('.social-bloom-visual')).toHaveCount(1);
  await expect(host.locator('.social-announcement')).toContainText('1 reaction and 1 signal');
  await expect(guest.locator('.social-bloom-visual')).toBeHidden();
  await expect(guest.locator('.social-announcement')).toBeVisible();
  await host.getByRole('button', {name: 'Close session ember'}).click();
  await host.locator('.tool-dock').getByRole('button', {name: 'Room', exact: true}).click();
  await expect(host.locator('.porch-messages').getByText('A quiet thought for later')).toBeVisible();
  await expect(host.getByText('The room can talk.')).toBeVisible();
  await host.getByRole('button', {name: 'Ready'}).click();
  await expect(host.locator('.person').filter({hasText: 'Maya'}).locator('.posture')).toHaveText('ready');

  await host.reload();
  await host.locator('.tool-dock').getByRole('button', {name: 'Room', exact: true}).click();
  await expect(host.locator('.porch-release-note')).toContainText('1 reaction and 1 signal');
  await expect(host.locator('.porch-messages').getByText('A quiet thought for later')).toBeVisible();
  await expect(host.locator('.social-bloom-visual')).toHaveCount(0);

  await host.getByRole('button', {name: 'Promote to Spark'}).click();
  await host.locator('.tool-dock').getByRole('button', {name: 'Workspace', exact: true}).click();
  await host.getByRole('tab', {name: /Sparks/}).click();
  await expect(host.locator('.spark-list').getByText('A quiet thought for later')).toBeVisible();
  await guest.locator('.tool-dock').getByRole('button', {name: 'Workspace', exact: true}).click();
  await guest.getByRole('tab', {name: /Sparks/}).click();
  await expect(guest.locator('.spark-list').getByText('A quiet thought for later')).toBeVisible();

  await expect(host.getByText('Return approaching')).toBeVisible({timeout: 28_000});
  await expect(host.getByRole('region', {name: 'Return to the Floor'})).toContainText(/0[0-9]:0[0-9] until the next Block/);
  await guest.getByRole('button', {name: 'Pause my presence'}).click();
  await host.reload();
  await expect(host.getByText('Return approaching')).toBeVisible();
  await expect(host.locator('.social-bloom-visual')).toHaveCount(0);

  await expect(host.getByText('The room is gathering')).toBeVisible({timeout: 10_000});
  await host.getByRole('button', {name: 'Room', exact: true}).click();
  await expect(host.locator('.porch-messages').getByText('A quiet thought for later')).toBeVisible();
  const guestStarts = guest.getByRole('button', {name: 'Start next Block'});
  if (await guestStarts.isVisible()) await guestStarts.click();
  else await host.getByRole('button', {name: 'Start next Block'}).click();

  await expect(host.getByText('Conversation is resting.')).toBeVisible();
  await expect(host.locator('.porch-messages').getByText('A quiet thought for later')).toHaveCount(0);
  await expect(host.locator('.person').filter({hasText: 'Jules'}).locator('.posture')).toHaveText('away');
  await expect(host.locator('.person').filter({hasText: 'Maya'}).locator('.posture')).toHaveText('focusing');
  await guest.getByRole('button', {name: 'Environment', exact: true}).click();
  await expect(guest.getByRole('button', {name: 'View closed'})).toBeVisible();
  await expect(guest.getByRole('button', {name: 'Ritual cues off'})).toBeVisible();
  await expect(guest.getByRole('button', {name: 'Social sounds off'})).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});

test('the core room is accessible and fits a phone viewport', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  const page = await context.newPage();
  await page.goto(`/?room=access-${crypto.randomUUID()}`);
  await expect(page.getByText('you hold the room tempo')).toBeVisible();
  await expect(page.getByRole('region', {name: 'Return to the Floor'})).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const opener = page.getByRole('button', {name: 'Environment'});
  await opener.click();
  const environmentHeading = page.getByRole('heading', {name: 'Environment'});
  await expect(environmentHeading).toBeVisible();
  await expect(environmentHeading).toBeFocused();
  const results = await new AxeBuilder({page}).exclude('.living-window iframe').analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole('button', {name: 'Close Environment'}).click();
  await expect(page.getByRole('heading', {name: 'Environment'})).toBeHidden();
  await expect(opener).toBeFocused();
  await page.locator('.tool-dock').getByRole('button', {name: 'Room', exact: true}).click();
  const composer = await page.getByLabel('Write to the room').boundingBox();
  const send = await page.locator('.porch-send').boundingBox();
  expect(composer?.height).toBeGreaterThanOrEqual(44);
  expect(send?.height).toBeGreaterThanOrEqual(44);
  const roomResults = await new AxeBuilder({page}).exclude('.living-window iframe').analyze();
  expect(roomResults.violations).toEqual([]);
  await context.close();
});

test('the room view converges while personal media preferences stay local', async ({browser}) => {
  test.setTimeout(75_000);
  const room = `backdrop-${crypto.randomUUID()}`;
  const hostContext = await browser.newContext();
  const followerContext = await browser.newContext();
  await Promise.all([blockRemoteMedia(hostContext), blockRemoteMedia(followerContext)]);
  const host = await hostContext.newPage();
  const follower = await followerContext.newPage();
  await host.goto(`/?room=${room}`);
  await expect(host.getByText('you hold the room tempo')).toBeVisible();
  await follower.goto(`/?room=${room}`);
  const hostFrame = host.locator('.living-window iframe');
  const followerFrame = follower.locator('.living-window iframe');
  await expect(hostFrame).toHaveAttribute('src', /BSWhGNXxT9A/);
  await expect(followerFrame).toHaveAttribute('src', /BSWhGNXxT9A/);
  const geometry = await host.evaluate(() => document.querySelector('.media-stage')!.getBoundingClientRect().toJSON());
  expect(geometry.left).toBe(0);
  expect(geometry.top).toBe(0);
  expect(geometry.width).toBe(await host.evaluate(() => innerWidth));
  expect(geometry.height).toBe(await host.evaluate(() => innerHeight));

  await follower.getByRole('button', {name: 'Environment'}).click();
  await expect(follower.getByText('Open deck · everyone can add and arrange.')).toBeVisible();
  await follower.locator('.deck-composer summary').click();
  await follower.getByRole('button', {name: /ABC7 Treasure Island/}).click();
  await expect(hostFrame).toHaveAttribute('src', /_VqvVJfmyfs/);
  await expect(followerFrame).toHaveAttribute('src', /_VqvVJfmyfs/);
  await followerFrame.evaluate((element) => { element.dataset.identity = 'retained'; });
  await follower.getByRole('button', {name: 'Shared sound muted'}).click();
  expect(await followerFrame.getAttribute('data-identity')).toBe('retained');

  await host.getByRole('button', {name: 'Environment'}).click();
  await host.locator('.deck-composer summary').click();
  await host.getByRole('button', {name: /TrazCam Bay Life/}).click();
  await expect(hostFrame).toHaveAttribute('src', /E_kvIXtF_yo/);
  await expect(followerFrame).toHaveAttribute('src', /E_kvIXtF_yo/);

  await host.getByLabel('YouTube video or playlist URL').fill('https://www.youtube.com/playlist?list=PL1234567890abc');
  await host.locator('.custom-scene').getByRole('button', {name: 'Add to deck'}).click();
  await host.locator('.deck-list li').filter({hasText: 'Room playlist'}).getByRole('button', {name: 'Use now'}).click();
  await expect(hostFrame).toHaveAttribute('src', /embed\/videoseries/);
  await expect(followerFrame).toHaveAttribute('src', /list=PL1234567890abc/);
  expect(await host.evaluate(() => JSON.parse(localStorage.getItem('magma:youtube-backdrop:v2') ?? '{}').muted ?? true)).toBe(true);
  expect(await follower.evaluate(() => JSON.parse(localStorage.getItem('magma:youtube-backdrop:v2') ?? '{}').muted)).toBe(false);
  expect(await host.evaluate(() => 'source' in JSON.parse(localStorage.getItem('magma:youtube-backdrop:v2') ?? '{}'))).toBe(false);

  await follower.getByRole('button', {name: 'Quiet everything'}).click();
  await expect(followerFrame).toHaveCount(0);
  await expect(hostFrame).toHaveAttribute('src', /list=PL1234567890abc/);
  await follower.getByRole('button', {name: /Earth from the ISS/}).click();
  await expect(hostFrame).toHaveAttribute('src', /sWasdbDVNvc/);
  await expect(followerFrame).toHaveCount(0);
  await follower.getByRole('button', {name: 'View closed'}).click();
  await expect(followerFrame).toHaveAttribute('src', /sWasdbDVNvc/);
  await follower.reload();
  await expect(followerFrame).toHaveAttribute('src', /sWasdbDVNvc/);

  await host.getByRole('button', {name: 'Camera controls'}).click();
  await expect(host.getByRole('button', {name: 'Return to instrument'})).toBeVisible();
  expect(await hostFrame.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('auto');
  await hostContext.close();
  await followerContext.close();
});

test('Floor additions stay quiet, then the Listening Deck opens once in canonical order', async ({browser}) => {
  test.setTimeout(75_000);
  const room = `deck-${crypto.randomUUID()}`;
  const adaContext = await browser.newContext();
  const linContext = await browser.newContext();
  await Promise.all([blockRemoteMedia(adaContext), blockRemoteMedia(linContext)]);
  const ada = await adaContext.newPage();
  const lin = await linContext.newPage();
  await ada.goto(`/?room=${room}`);
  await lin.goto(`/?room=${room}`);
  await enterAs(ada, 'Ada', 'Hold one clean block');
  await enterAs(lin, 'Lin', 'Keep the threshold calm');

  await ada.getByRole('button', {name: 'Tempo'}).click();
  await ada.getByRole('spinbutton', {name: 'Focus min'}).fill('0.5');
  await ada.getByRole('button', {name: 'Set room cadence'}).click();
  await ada.locator('.tool-dock').getByRole('button', {name: 'Focus'}).click();
  await ada.getByRole('button', {name: 'Start together'}).click();
  await expect(ada.getByRole('button', {name: 'Pause together'})).toBeVisible();
  await expect(lin.getByRole('button', {name: 'Ask to pause'})).toBeVisible();

  await Promise.all([
    ada.getByRole('button', {name: 'Environment'}).click(),
    lin.getByRole('button', {name: 'Environment'}).click(),
  ]);
  const adaDeck = ada.locator('.listening-deck');
  const linDeck = lin.locator('.listening-deck');
  await Promise.all([
    ada.locator('.deck-composer summary').click(),
    lin.locator('.deck-composer summary').click(),
  ]);
  await Promise.all([
    ada.getByRole('button', {name: /ABC7 Treasure Island/}).click(),
    lin.getByRole('button', {name: /TrazCam Bay Life/}).click(),
  ]);
  await Promise.all([
    ada.locator('.deck-composer summary').click(),
    lin.locator('.deck-composer summary').click(),
  ]);

  await expect(adaDeck.locator('.deck-list li')).toHaveCount(0);
  await expect(linDeck.locator('.deck-list li')).toHaveCount(0);
  await expect(adaDeck.locator('.deck-now')).toContainText('Treasure Island panorama');
  await expect(ada.locator('.living-window iframe')).toHaveAttribute('src', /BSWhGNXxT9A/);
  await lin.getByRole('button', {name: 'View open'}).click();
  await expect(lin.locator('.living-window iframe')).toHaveCount(0);

  const adaOrder = adaDeck.locator('.deck-now, .deck-list');
  const linOrder = linDeck.locator('.deck-now, .deck-list');
  const orderText = async (locator: typeof adaOrder) => (await locator.allTextContents()).join(' ');
  await expect.poll(() => orderText(adaOrder), {timeout: 40_000}).toContain('ABC7 Treasure Island');
  expect(await orderText(adaOrder)).toContain('TrazCam Bay Life');
  expect(await orderText(adaOrder)).toContain('Ada');
  expect(await orderText(adaOrder)).toContain('Lin');
  expect(await orderText(linOrder)).toContain('ABC7 Treasure Island');
  expect(await orderText(linOrder)).toContain('TrazCam Bay Life');
  await expect(ada.locator('.living-window iframe')).not.toHaveAttribute('src', /BSWhGNXxT9A/);
  await expect(lin.locator('.living-window iframe')).toHaveCount(0);

  await lin.reload();
  await lin.getByRole('button', {name: 'Environment'}).click();
  const restoredOrder = lin.locator('.deck-now, .deck-list');
  await expect.poll(() => orderText(restoredOrder)).toContain('ABC7 Treasure Island');
  expect(await orderText(restoredOrder)).toContain('TrazCam Bay Life');
  await expect(lin.locator('.living-window iframe')).toHaveCount(0);
  await adaContext.close();
  await linContext.close();
});

test('surface drafts survive a posture change while the clock remains reachable', async ({page}) => {
  await page.goto(`/?room=posture-${crypto.randomUUID()}`);
  await page.getByRole('button', {name: 'Workspace'}).click();
  await page.getByPlaceholder('What are we making real?').fill('A draft that stays put');
  await page.setViewportSize({width: 390, height: 844});
  await expect(page.getByPlaceholder('What are we making real?')).toHaveValue('A draft that stays put');
  await page.locator('.tool-dock').getByRole('button', {name: 'Focus'}).click();
  await expect(page.getByRole('timer')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('one member keeps room authority across their browser tabs', async ({browser}) => {
  const room = `member-host-${crypto.randomUUID()}`;
  const context = await browser.newContext();
  const first = await context.newPage();
  await first.goto(`/?room=${room}`);
  await expect(first.getByText('you hold the room tempo')).toBeVisible();
  const second = await context.newPage();
  await second.goto(`/?room=${room}`);
  await expect(second.getByText('you hold the room tempo')).toBeVisible();
  await expect(second.getByRole('button', {name: 'Open Room, 1 person in room'})).toBeVisible();
  await expect(second.locator('.room-locus small')).toHaveText('1 in room');
  await first.locator('.tool-dock').getByRole('button', {name: 'Room', exact: true}).click();
  await first.locator('.presence-choices').getByRole('button', {name: 'Ready'}).click();
  await second.locator('.tool-dock').getByRole('button', {name: 'Room', exact: true}).click();
  await expect(second.locator('.presence-choices').getByRole('button', {name: 'Ready'})).toHaveAttribute('aria-pressed', 'true');
  await second.locator('.presence-choices').getByRole('button', {name: 'Away'}).click();
  await expect(first.locator('.person').locator('.posture')).toHaveText('away');
  await first.locator('.tool-dock').getByRole('button', {name: 'Focus', exact: true}).click();
  await second.locator('.tool-dock').getByRole('button', {name: 'Focus', exact: true}).click();
  await second.getByRole('button', {name: 'Start together'}).click();
  await expect(first.getByRole('button', {name: 'Pause together'})).toBeVisible();
  await first.close();
  await expect(second.getByText('the room is in flow')).toBeVisible();
  await expect(second.getByRole('button', {name: 'Pause together'})).toBeVisible();
  await context.close();
});
