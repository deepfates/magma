import {expect, test, type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const enterAs = async (page: Page, name: string, intention: string) => {
  await page.getByRole('button', {name: 'Room'}).click();
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
  await first.getByRole('button', {name: 'Room'}).click();
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

test('the core room is accessible and fits a phone viewport', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  const page = await context.newPage();
  await page.goto(`/?room=access-${crypto.randomUUID()}`);
  await expect(page.getByText('you hold the room tempo')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const opener = page.getByRole('button', {name: 'Environment'});
  await opener.click();
  await expect(page.getByRole('heading', {name: 'Environment'})).toBeVisible();
  const results = await new AxeBuilder({page}).exclude('.living-window iframe').analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole('button', {name: 'Close Environment'}).click();
  await expect(page.getByRole('heading', {name: 'Environment'})).toBeHidden();
  await context.close();
});

test('the room view converges while personal media preferences stay local', async ({browser}) => {
  const room = `backdrop-${crypto.randomUUID()}`;
  const hostContext = await browser.newContext();
  const followerContext = await browser.newContext();
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
  await expect(follower.getByText('Everyone here can steer the shared view.')).toBeVisible();
  await follower.getByRole('button', {name: /ABC7 Treasure Island/}).click();
  await expect(hostFrame).toHaveAttribute('src', /_VqvVJfmyfs/);
  await expect(followerFrame).toHaveAttribute('src', /_VqvVJfmyfs/);
  await followerFrame.evaluate((element) => { element.dataset.identity = 'retained'; });
  await follower.getByRole('button', {name: 'Camera muted'}).click();
  expect(await followerFrame.getAttribute('data-identity')).toBe('retained');

  await host.getByRole('button', {name: 'Environment'}).click();
  await host.getByRole('button', {name: /TrazCam Bay Life/}).click();
  await expect(hostFrame).toHaveAttribute('src', /E_kvIXtF_yo/);
  await expect(followerFrame).toHaveAttribute('src', /E_kvIXtF_yo/);

  await host.getByLabel('YouTube video or playlist URL').fill('https://www.youtube.com/playlist?list=PL1234567890abc');
  await host.getByRole('button', {name: 'Set for room'}).click();
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
  await follower.getByRole('button', {name: 'Open selected view'}).click();
  await expect(followerFrame).toHaveAttribute('src', /sWasdbDVNvc/);
  await follower.reload();
  await expect(followerFrame).toHaveAttribute('src', /sWasdbDVNvc/);

  await host.getByRole('button', {name: 'Camera controls'}).click();
  await expect(host.getByRole('button', {name: 'Return to instrument'})).toBeVisible();
  expect(await hostFrame.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('auto');
  await hostContext.close();
  await followerContext.close();
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
  await second.getByRole('button', {name: 'Start together'}).click();
  await expect(first.getByRole('button', {name: 'Pause together'})).toBeVisible();
  await first.close();
  await expect(second.getByText('the room is in flow')).toBeVisible();
  await expect(second.getByRole('button', {name: 'Pause together'})).toBeVisible();
  await context.close();
});
