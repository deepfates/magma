import {expect, test, type BrowserContext, type Page, type WebSocketRoute} from '@playwright/test';

const blockRemoteMedia = (context: BrowserContext) => context.route(
  /(youtube(?:-nocookie)?\.com|googlevideo\.com|ytimg\.com)/,
  (route) => route.abort(),
);

const trackCanvasSockets = async (context: BrowserContext) => {
  const sockets: WebSocketRoute[] = [];
  await context.routeWebSocket(/\/parties\/canvas\//, (socket) => {
    sockets.push(socket);
    socket.connectToServer();
  });
  return sockets;
};

const forceCanvasReconnect = async (sockets: WebSocketRoute[], page: Page) => {
  const before = sockets.length;
  const active = sockets.at(-1);
  if (!active) throw new Error('No canvas socket to reconnect');
  await active.close({code: 4000, reason: 'forced canvas reconnect'});

  await expect.poll(() => sockets.length, {timeout: 15_000}).toBe(before + 1);
  await expect(page.locator('.porch-canvas-engine')).toHaveAttribute('data-connection', 'open', {timeout: 15_000});

  const admissions = sockets.map((socket) => new URL(socket.url()).searchParams.get('admission'));
  expect(admissions.every(Boolean)).toBe(true);
  expect(new Set(admissions).size).toBe(admissions.length);
};

const sceneElements = async (page: Page) => JSON.parse(
  await page.locator('.porch-canvas-engine').getAttribute('data-scene') || '[]',
) as {id: string; text?: string}[];

const expectOneNote = async (page: Page, text: string) => {
  await expect.poll(async () => (await sceneElements(page)).filter((element) => element.text === text).length).toBe(1);
};

const addNote = async (page: Page, text: string, x = 300, y = 260) => {
  const engine = page.locator('.porch-canvas-engine');
  const canvas = page.locator('canvas.excalidraw__canvas.interactive');
  await expect(engine).toHaveAttribute('data-connection', 'open');
  await expect(canvas).toBeVisible();
  await page.getByRole('button', {name: 'Move', exact: true}).click();
  await page.getByRole('button', {name: 'Note', exact: true}).click();
  await canvas.click({position: {x, y}});
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await expect.poll(async () => JSON.parse(await engine.getAttribute('data-scene') || '[]').some((element: {text?: string}) => element.text === text)).toBe(true);
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
  await expect(owner.locator('.porch-canvas-engine')).toHaveAttribute('data-connection', 'open');
  await owner.waitForTimeout(8_000);
  await expect(owner.locator('canvas.excalidraw__canvas.interactive')).toBeVisible();

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
  await expect.poll(async () => JSON.parse(await owner.locator('.porch-canvas-engine').getAttribute('data-scene') || '[]').some((element: {text?: string}) => element.text === 'Everyone can leave something here')).toBe(true);

  await Promise.all([ownerContext.close(), friendContext.close(), thirdContext.close()]);
});

test('a protected canvas reconnects repeatedly with fresh admission and one shared scene', async ({browser}) => {
  const ownerContext = await browser.newContext({permissions: ['clipboard-read', 'clipboard-write']});
  const friendContext = await browser.newContext();
  const [, , ownerCanvasSockets] = await Promise.all([
    blockRemoteMedia(ownerContext), blockRemoteMedia(friendContext), trackCanvasSockets(ownerContext),
  ]);

  const owner = await ownerContext.newPage();
  await owner.goto('/');
  await owner.getByLabel('Name', {exact: true}).fill('Ada');
  await owner.getByRole('button', {name: 'Open the porch'}).click();
  await owner.getByRole('button', {name: 'Copy invitation'}).click();
  const invitation = parseInvitation(await owner.locator('.arrival-invitation-ready textarea').inputValue());
  await owner.getByRole('button', {name: 'Enter the porch'}).click();
  await expect(owner.locator('.porch-canvas-engine')).toHaveAttribute('data-connection', 'open');

  const friend = await friendContext.newPage();
  await enterInvitation(friend, invitation, 'Lin');
  await expect(owner.getByRole('button', {name: /2 here/})).toBeVisible();

  await addNote(owner, 'Still here before reconnect');
  await expectOneNote(friend, 'Still here before reconnect');
  const roomUrl = owner.url();

  await forceCanvasReconnect(ownerCanvasSockets, owner);
  await forceCanvasReconnect(ownerCanvasSockets, owner);

  expect(owner.url()).toBe(roomUrl);
  await expect(owner.getByRole('button', {name: /2 here/})).toBeVisible();
  await expectOneNote(owner, 'Still here before reconnect');
  await expectOneNote(friend, 'Still here before reconnect');

  await addNote(owner, 'Ada after reconnect', 650, 300);
  await expectOneNote(friend, 'Ada after reconnect');
  await addNote(friend, 'Lin after reconnect', 850, 420);
  await expectOneNote(owner, 'Lin after reconnect');

  for (const page of [owner, friend]) {
    const elements = await sceneElements(page);
    expect(new Set(elements.map((element) => element.id)).size).toBe(elements.length);
  }
  expect(ownerCanvasSockets).toHaveLength(3);

  await Promise.all([ownerContext.close(), friendContext.close()]);
});
