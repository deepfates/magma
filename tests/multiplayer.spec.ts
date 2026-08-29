import {expect, test, type BrowserContext, type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const blockRemoteMedia = (context: BrowserContext) => context.route(
  /(youtube(?:-nocookie)?\.com|googlevideo\.com|ytimg\.com)/,
  (route) => route.abort(),
);

type SceneElement = {id: string; type: string; x: number; y: number; text?: string};
const canvas = (page: Page) => page.locator('canvas.excalidraw__canvas.interactive');
const engine = (page: Page) => page.locator('.porch-canvas-engine');
const scene = async (page: Page): Promise<SceneElement[]> => JSON.parse(await engine(page).getAttribute('data-scene') || '[]');

const openGlass = async (page: Page, durable = false) => {
  await expect(engine(page)).toHaveAttribute('data-connection', 'open');
  await expect(canvas(page)).toBeVisible();
  if (durable) {
    await page.waitForTimeout(8_000);
    await expect(canvas(page)).toBeVisible();
    await expect(engine(page)).toHaveAttribute('data-connection', 'open');
  }
};

const addNote = async (page: Page, text: string, x = 360, y = 280) => {
  await openGlass(page);
  await page.getByRole('button', {name: 'Note', exact: true}).click();
  await canvas(page).click({position: {x, y}});
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await scene(page)).some((element) => element.text === text)).toBe(true);
  return (await scene(page)).find((element) => element.text === text)!;
};

test('two people can leave, move, delete, and return to the same porch', async ({browser}) => {
  const room = `porch-${crypto.randomUUID()}`;
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await Promise.all([blockRemoteMedia(firstContext), blockRemoteMedia(secondContext)]);
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await first.goto(`/?room=${room}`);
  await second.goto(`/?room=${room}`);

  await expect(first.getByRole('button', {name: /The Porch/})).toBeVisible();
  await expect(first.getByRole('button', {name: /2 here/})).toBeVisible();
  await openGlass(first, true);
  const note = await addNote(first, 'Meet me by the ferry');
  await expect.poll(async () => (await scene(second)).some((element) => element.text === 'Meet me by the ferry')).toBe(true);

  await second.getByRole('button', {name: 'Move', exact: true}).click();
  await second.mouse.move(note.x + 40, note.y + 12);
  await second.mouse.down();
  await second.mouse.move(note.x + 220, note.y + 112, {steps: 8});
  await second.mouse.up();
  await expect.poll(async () => (await scene(first)).find((element) => element.id === note.id)?.x ?? 0).toBeGreaterThan(note.x + 100);

  await second.locator('.porch-fixed-clock').getByRole('button', {name: 'Start'}).click();
  await expect(first.locator('.porch-fixed-clock').getByRole('button', {name: 'Pause'})).toBeVisible();
  await first.locator('.porch-fixed-clock').getByRole('button', {name: 'Pause'}).click();
  await expect(second.locator('.porch-fixed-clock').getByRole('button', {name: 'Start'})).toBeVisible();

  await first.reload();
  await openGlass(first, true);
  await expect.poll(async () => (await scene(first)).some((element) => element.text === 'Meet me by the ferry')).toBe(true);
  const moved = (await scene(second)).find((element) => element.id === note.id)!;
  await canvas(second).click({position: {x: moved.x + 35, y: moved.y + 10}});
  await second.keyboard.press('Delete');
  await expect.poll(async () => (await scene(first)).some((element) => element.text === 'Meet me by the ferry')).toBe(false);

  await Promise.all([firstContext.close(), secondContext.close()]);
});

test('everyone can tune the shared window while glass and sound remain personal', async ({browser}) => {
  test.setTimeout(90_000);
  const room = `window-${crypto.randomUUID()}`;
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await Promise.all([blockRemoteMedia(firstContext), blockRemoteMedia(secondContext)]);
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await first.goto(`/?room=${room}`);
  await second.goto(`/?room=${room}`);

  await second.getByRole('button', {name: /The Porch/}).click();
  await second.getByRole('button', {name: /ABC7 Treasure Island/}).click();
  await expect(first.locator('.living-window iframe')).toHaveAttribute('src', /_VqvVJfmyfs/);
  await expect(second.locator('.living-window iframe')).toHaveAttribute('src', /_VqvVJfmyfs/);

  const tunerInput = second.getByPlaceholder('Paste a YouTube video, live feed, or playlist');
  if (!await tunerInput.isVisible()) await second.getByRole('button', {name: /The Porch/}).click();
  await second.getByRole('button', {name: 'Unmute for me', exact: true}).click();
  await expect(second.getByRole('button', {name: 'Mute for me', exact: true})).toBeVisible();
  await first.getByRole('button', {name: /The Porch/}).click();
  await expect(first.getByRole('button', {name: 'Unmute for me', exact: true})).toBeVisible();
  await first.getByRole('button', {name: /The Porch/}).click();
  const glow = second.getByRole('button', {name: /^Glow/});
  await expect(glow).toBeVisible();
  await glow.click();
  await expect(second.locator('.porch-glow')).toBeVisible();
  await expect(first.locator('.porch-glow')).toHaveCount(0);
  if (await tunerInput.isVisible()) await second.getByRole('button', {name: /The Porch/}).click();

  await first.getByRole('button', {name: /Glass on/}).click();
  await expect(first.locator('.porch-canvas-adapter')).toHaveClass(/glass-hidden/);
  await expect(second.locator('.porch-canvas-adapter')).not.toHaveClass(/glass-hidden/);

  await second.getByRole('button', {name: 'Talk', exact: true}).click();
  await second.getByLabel('Write to the room').fill('Tea is ready by the window');
  await second.getByRole('button', {name: 'Send', exact: true}).click();
  await first.getByRole('button', {name: /2 here/}).click();
  await expect(first.getByRole('log', {name: 'Room messages'})).toContainText('Tea is ready by the window');

  if (!await tunerInput.isVisible()) await second.getByRole('button', {name: /The Porch/}).click();
  await tunerInput.fill('https://www.youtube.com/playlist?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs');
  await second.getByRole('button', {name: 'Add', exact: true}).click();
  await expect(first.locator('.living-window iframe')).toHaveAttribute('src', /list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs/);

  await Promise.all([firstContext.close(), secondContext.close()]);
});

test('the porch fits a phone and its primary controls have no serious accessibility violations', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  await blockRemoteMedia(context);
  const page = await context.newPage();
  await page.goto(`/?room=phone-${crypto.randomUUID()}`);
  await expect(page.getByRole('button', {name: /The Porch/})).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await addNote(page, 'A small screen can still leave a trace', 140, 300);
  await expect.poll(async () => (await scene(page)).some((element) => element.text === 'A small screen can still leave a trace')).toBe(true);
  await page.getByRole('button', {name: /The Porch/}).click();
  await expect(page.getByRole('heading', {name: 'Where should we look?'})).toBeVisible();
  const results = await new AxeBuilder({page}).exclude('.living-window iframe').exclude('.porch-canvas-adapter').analyze();
  expect(results.violations).toEqual([]);
  await context.close();
});
