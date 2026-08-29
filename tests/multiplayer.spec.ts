import {expect, test, type BrowserContext, type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const blockRemoteMedia = (context: BrowserContext) => context.route(
  /(youtube(?:-nocookie)?\.com|googlevideo\.com|ytimg\.com)/,
  (route) => route.abort(),
);

const canvas = (page: Page) => page.locator('.tl-canvas[data-testid="canvas"]');
const notes = (page: Page) => page.locator('.tl-shape[data-shape-type="note"]');

const addNote = async (page: Page, text: string, x = 360, y = 280) => {
  await expect(canvas(page)).toBeVisible();
  await page.getByRole('button', {name: 'Note', exact: true}).click();
  await expect(page.locator('.tl-container')).toHaveAttribute('data-state', /note/);
  await canvas(page).click({position: {x, y}});
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await expect(notes(page).last()).toContainText(text);
  return notes(page).last();
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
  await addNote(first, 'Meet me by the ferry');
  await expect(notes(second).filter({hasText: 'Meet me by the ferry'})).toHaveCount(1);

  await second.getByRole('button', {name: 'Move', exact: true}).click();
  const sharedNote = notes(second).filter({hasText: 'Meet me by the ferry'});
  const beforeMove = await sharedNote.boundingBox();
  if (!beforeMove) throw new Error('Shared tldraw note has no bounds');
  await second.mouse.move(beforeMove.x + beforeMove.width / 2, beforeMove.y + beforeMove.height / 2);
  await second.mouse.down();
  await second.mouse.move(beforeMove.x + beforeMove.width / 2 + 180, beforeMove.y + beforeMove.height / 2 + 100, {steps: 8});
  await second.mouse.up();
  await expect.poll(async () => (await notes(first).filter({hasText: 'Meet me by the ferry'}).boundingBox())?.x ?? 0).toBeGreaterThan(beforeMove.x + 100);

  await second.locator('.porch-fixed-clock').getByRole('button', {name: 'Start'}).click();
  await expect(first.locator('.porch-fixed-clock').getByRole('button', {name: 'Pause'})).toBeVisible();
  await first.locator('.porch-fixed-clock').getByRole('button', {name: 'Pause'}).click();
  await expect(second.locator('.porch-fixed-clock').getByRole('button', {name: 'Start'})).toBeVisible();

  await first.reload();
  await expect(canvas(first)).toBeVisible();
  await expect(notes(first).filter({hasText: 'Meet me by the ferry'})).toHaveCount(1);
  await sharedNote.click();
  await second.keyboard.press('Delete');
  await expect(notes(first).filter({hasText: 'Meet me by the ferry'})).toHaveCount(0);

  await Promise.all([firstContext.close(), secondContext.close()]);
});

test('everyone can tune the shared window while glass and sound remain personal', async ({browser}) => {
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

  const glow = second.getByRole('button', {name: /^Glow/});
  await expect(glow).toBeVisible();
  await glow.click();
  await expect(second.locator('.porch-glow')).toBeVisible();
  await expect(first.locator('.porch-glow')).toHaveCount(0);

  await first.getByRole('button', {name: /Glass on/}).click();
  await expect(first.locator('.porch-canvas-adapter')).toHaveClass(/glass-hidden/);
  await expect(second.locator('.porch-canvas-adapter')).not.toHaveClass(/glass-hidden/);

  await Promise.all([firstContext.close(), secondContext.close()]);
});

test('the porch fits a phone and its core controls have no serious accessibility violations', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  await blockRemoteMedia(context);
  const page = await context.newPage();
  await page.goto(`/?room=phone-${crypto.randomUUID()}`);
  await expect(page.getByRole('button', {name: /The Porch/})).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await addNote(page, 'A small screen can still leave a trace', 140, 300);
  await expect(notes(page).filter({hasText: 'A small screen can still leave a trace'})).toHaveCount(1);
  await page.getByRole('button', {name: /The Porch/}).click();
  await expect(page.getByRole('heading', {name: 'Where should we look?'})).toBeVisible();
  const results = await new AxeBuilder({page}).exclude('.living-window iframe').analyze();
  expect(results.violations).toEqual([]);
  await context.close();
});
