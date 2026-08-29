import {expect, test, type BrowserContext, type Page} from '@playwright/test';

const blockRemoteMedia = (context: BrowserContext) => context.route(
  /(youtube(?:-nocookie)?\.com|googlevideo\.com|ytimg\.com)/,
  (route) => route.abort(),
);

const addNote = async (page: Page, text: string, x = 300, y = 260) => {
  const canvas = page.locator('.tl-canvas[data-testid="canvas"]');
  await expect(canvas).toBeVisible();
  await page.getByRole('button', {name: 'Note', exact: true}).click();
  await canvas.click({position: {x, y}});
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
};

const parseInvitation = (text: string) => {
  const roomUrl = text.match(/https?:\/\/\S+/)?.[0];
  const capability = text.match(/mgi1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}/)?.[0];
  if (!roomUrl || !capability) throw new Error('Invitation is missing its URL or code');
  return {roomUrl, capability};
};

const enterInvitation = async (page: Page, invitation: ReturnType<typeof parseInvitation>, name: string) => {
  await page.goto(invitation.roomUrl);
  await page.getByLabel('Name', {exact: true}).fill(name);
  await page.getByLabel('Invitation code').fill(invitation.capability);
  await page.getByRole('button', {name: 'Come in'}).click();
  await expect(page.getByRole('button', {name: /The Porch/})).toBeVisible();
};

test('a porch opens by invitation, returns by device proof, and every person can invite', async ({browser}) => {
  const ownerContext = await browser.newContext({permissions: ['clipboard-read', 'clipboard-write']});
  const friendContext = await browser.newContext();
  const thirdContext = await browser.newContext();
  await Promise.all([blockRemoteMedia(ownerContext), blockRemoteMedia(friendContext), blockRemoteMedia(thirdContext)]);
  const owner = await ownerContext.newPage();
  await owner.goto('/');
  await expect(owner.getByRole('heading', {name: 'Make a porch'})).toBeVisible();
  await owner.getByLabel('Name', {exact: true}).fill('Ada');
  await owner.getByRole('button', {name: 'Open the porch'}).click();
  await expect(owner.getByRole('heading', {name: 'Your porch is ready.'})).toBeVisible();
  await owner.getByRole('button', {name: 'Copy invitation'}).click();
  const firstInvitation = parseInvitation(await owner.locator('.arrival-invitation-ready textarea').inputValue());
  expect(firstInvitation.roomUrl).not.toContain(firstInvitation.capability);
  await owner.getByRole('button', {name: 'Enter the porch'}).click();
  await expect(owner.getByRole('button', {name: /The Porch/})).toBeVisible();

  const friend = await friendContext.newPage();
  await enterInvitation(friend, firstInvitation, 'Lin');
  await expect(owner.getByRole('button', {name: /2 here/})).toBeVisible();
  await owner.reload();
  await expect(owner.getByRole('button', {name: /The Porch/})).toBeVisible();
  await expect(owner.getByRole('button', {name: /2 here/})).toBeVisible();

  await friend.getByRole('button', {name: 'Invite'}).click();
  await friend.getByRole('button', {name: /2 here/}).click();
  const secondInvitation = parseInvitation(await friend.locator('.porch-share-copy textarea').inputValue());
  const third = await thirdContext.newPage();
  await enterInvitation(third, secondInvitation, 'Grace');
  await expect(owner.getByRole('button', {name: /3 here/})).toBeVisible();

  await addNote(third, 'Everyone can leave something here');
  await expect(owner.locator('.tl-shape[data-shape-type="note"]')).toContainText('Everyone can leave something here');

  await Promise.all([ownerContext.close(), friendContext.close(), thirdContext.close()]);
});
