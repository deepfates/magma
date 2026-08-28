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

test('the living view persists without overlapping the instrument', async ({page}) => {
  await page.goto(`/?room=backdrop-${crypto.randomUUID()}`);
  const frame = page.locator('.living-window iframe');
  await expect(frame).toHaveAttribute('src', /BSWhGNXxT9A/);
  const geometry = await page.evaluate(() => {
    const media = document.querySelector('.media-stage')!.getBoundingClientRect();
    const rail = document.querySelector('.instrument-rail')!.getBoundingClientRect();
    return {mediaRight: media.right, railLeft: rail.left, mediaBottom: media.bottom, railTop: rail.top};
  });
  expect(geometry.mediaRight <= geometry.railLeft || geometry.mediaBottom <= geometry.railTop).toBe(true);
  await page.getByRole('button', {name: 'Environment'}).click();
  await page.getByRole('button', {name: 'Quiet everything'}).click();
  await expect(frame).toHaveCount(0);
  await page.getByRole('button', {name: 'Open selected view'}).click();
  await expect(frame).toHaveAttribute('src', /BSWhGNXxT9A/);
  await page.getByLabel('YouTube video or playlist URL').fill('https://www.youtube.com/playlist?list=PL1234567890abc');
  await page.getByRole('button', {name: 'Load'}).click();
  await expect(frame).toHaveAttribute('src', /embed\/videoseries/);
  await expect(frame).toHaveAttribute('src', /list=PL1234567890abc/);
  await page.reload();
  await expect(frame).toHaveAttribute('src', /list=PL1234567890abc/);
  await page.getByRole('button', {name: 'Environment'}).click();
  await page.getByRole('button', {name: 'Close live view'}).click();
  await expect(frame).toHaveCount(0);
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
