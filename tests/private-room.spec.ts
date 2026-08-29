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

type Presence = {
  memberId: string;
  name: string;
  color: string;
  pointer: {x: number; y: number} | null;
  button: 'up' | 'down';
  selectedElementIds: string[];
  posture: 'idle' | 'pointing' | 'selecting' | 'drawing' | 'typing';
  viewport: {scrollX: number; scrollY: number; zoom: number};
};

const presences = async (page: Page) => JSON.parse(
  await page.locator('.porch-canvas-engine').getAttribute('data-presence') || '[]',
) as Presence[];

const presenceNamed = async (page: Page, name: string) => (await presences(page)).find((presence) => presence.name === name);

const trackNativeCanvasSockets = (context: BrowserContext) => context.addInitScript(() => {
  const NativeWebSocket = window.WebSocket;
  class TrackedWebSocket extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      if (String(url).includes('/parties/canvas/')) {
        const trackedWindow = window as typeof window & {__porchCanvasSockets?: WebSocket[]};
        (trackedWindow.__porchCanvasSockets ??= []).push(this);
      }
    }
  }
  Object.defineProperty(window, 'WebSocket', {configurable: true, value: TrackedWebSocket});
});

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

test('people visibly inhabit the glass with bounded ephemeral presence', async ({browser}) => {
  test.setTimeout(90_000);
  const ownerContext = await browser.newContext({permissions: ['clipboard-read', 'clipboard-write']});
  const friendContext = await browser.newContext({reducedMotion: 'reduce'});
  await Promise.all([
    blockRemoteMedia(ownerContext), blockRemoteMedia(friendContext), trackNativeCanvasSockets(ownerContext),
  ]);

  const owner = await ownerContext.newPage();
  await owner.goto('/');
  await owner.getByLabel('Name', {exact: true}).fill('Ada');
  await owner.getByRole('button', {name: 'Open the porch'}).click();
  await owner.getByRole('button', {name: 'Copy invitation'}).click();
  const invitation = parseInvitation(await owner.locator('.arrival-invitation-ready textarea').inputValue());
  await owner.getByRole('button', {name: 'Enter the porch'}).click();

  const friend = await friendContext.newPage();
  await enterInvitation(friend, invitation, 'Lin');
  for (const page of [owner, friend]) {
    await expect(page.locator('.porch-canvas-engine')).toHaveAttribute('data-connection', 'open');
    await expect(page.locator('canvas.excalidraw__canvas.interactive')).toBeVisible();
  }
  await expect(owner.getByRole('button', {name: 'Follow Lin'})).toBeVisible();
  await expect(friend.getByRole('button', {name: 'Follow Ada'})).toBeVisible();
  await expect(friend.locator('.porch-canvas-engine')).toHaveAttribute('data-presence-motion', 'quiet');

  const ownerCanvas = owner.locator('canvas.excalidraw__canvas.interactive');
  const ownerBox = await ownerCanvas.boundingBox();
  if (!ownerBox) throw new Error('Owner canvas has no bounds');
  await owner.mouse.move(ownerBox.x + 430, ownerBox.y + 330);
  await expect.poll(async () => presenceNamed(friend, 'Ada')).toMatchObject({
    name: 'Ada', pointer: expect.any(Object), posture: 'pointing',
  });

  await owner.getByRole('button', {name: 'Draw', exact: true}).click();
  await owner.mouse.move(ownerBox.x + 500, ownerBox.y + 360);
  await owner.mouse.down();
  await owner.mouse.move(ownerBox.x + 560, ownerBox.y + 400, {steps: 5});
  await expect.poll(async () => presenceNamed(friend, 'Ada')).toMatchObject({posture: 'drawing', button: 'down'});
  await owner.mouse.up();

  const friendCanvas = friend.locator('canvas.excalidraw__canvas.interactive');
  const friendBox = await friendCanvas.boundingBox();
  if (!friendBox) throw new Error('Friend canvas has no bounds');
  await friend.getByRole('button', {name: 'Note', exact: true}).click();
  await friendCanvas.click({position: {x: 720, y: 280}});
  await friend.keyboard.type('Lin is writing');
  await expect.poll(async () => presenceNamed(owner, 'Lin')).toMatchObject({posture: 'typing'});
  await friend.keyboard.press('Escape');

  await addNote(owner, 'A shared thing', 320, 260);
  await expectOneNote(friend, 'A shared thing');
  await friend.getByRole('button', {name: 'Move', exact: true}).click();
  await friendCanvas.click({position: {x: 320, y: 260}});
  await expect.poll(async () => (await presenceNamed(owner, 'Lin'))?.selectedElementIds.length).toBeGreaterThan(0);

  const ownerPresence = await presenceNamed(friend, 'Ada');
  if (!ownerPresence) throw new Error('Ada presence did not arrive');
  await owner.evaluate(({memberId}) => {
    const sockets = (window as typeof window & {__porchCanvasSockets?: WebSocket[]}).__porchCanvasSockets ?? [];
    const socket = [...sockets].reverse().find((candidate) => candidate.readyState === WebSocket.OPEN);
    if (!socket) throw new Error('No open tracked canvas socket');
    socket.send(JSON.stringify({
      type: 'presence.update', memberId: 'member_victim', name: 'Mallory', color: '#000000',
      pointer: {x: 777, y: 888}, button: 'up', selectedElementIds: [],
      viewport: {scrollX: 0, scrollY: 0, zoom: 1}, posture: 'pointing', claimedMemberId: memberId,
    }));
  }, {memberId: ownerPresence.memberId});
  await expect.poll(async () => presenceNamed(friend, 'Ada')).toMatchObject({
    memberId: ownerPresence.memberId, name: 'Ada', color: ownerPresence.color, pointer: {x: 777, y: 888},
  });
  expect((await presences(friend)).some((presence) => presence.name === 'Mallory' || presence.memberId === 'member_victim')).toBe(false);

  await friend.getByRole('button', {name: 'Follow Ada'}).click();
  await expect(friend.locator('.porch-canvas-engine')).toHaveAttribute('data-following', ownerPresence.memberId);
  const beforeFollowView = await friend.locator('.porch-canvas-engine').getAttribute('data-local-view');
  await ownerCanvas.hover();
  await owner.keyboard.down('Space');
  await owner.mouse.move(ownerBox.x + 500, ownerBox.y + 400);
  await owner.mouse.down();
  await owner.mouse.move(ownerBox.x + 620, ownerBox.y + 470, {steps: 5});
  await owner.mouse.up();
  await owner.keyboard.up('Space');
  await expect.poll(async () => friend.locator('.porch-canvas-engine').getAttribute('data-local-view')).not.toBe(beforeFollowView);
  const ownerView = JSON.parse(await owner.locator('.porch-canvas-engine').getAttribute('data-local-view') || '{}');
  await expect.poll(async () => JSON.parse(await friend.locator('.porch-canvas-engine').getAttribute('data-local-view') || '{}')).toMatchObject(ownerView);
  await friendCanvas.hover();
  await friend.mouse.wheel(0, 240);
  await expect(friend.locator('.porch-canvas-engine')).toHaveAttribute('data-following', '');

  const ownerSecondTab = await ownerContext.newPage();
  await ownerSecondTab.goto(owner.url());
  await expect(ownerSecondTab.locator('.porch-canvas-engine')).toHaveAttribute('data-connection', 'open');
  const secondCanvas = ownerSecondTab.locator('canvas.excalidraw__canvas.interactive');
  await expect(secondCanvas).toBeVisible();
  const secondBox = await secondCanvas.boundingBox();
  if (!secondBox) throw new Error('Second owner canvas has no bounds');
  await ownerSecondTab.mouse.move(secondBox.x + 800, secondBox.y + 500);
  await expect.poll(async () => (await presences(friend)).filter((presence) => presence.memberId === ownerPresence.memberId)).toHaveLength(1);
  await expect.poll(async () => presenceNamed(friend, 'Ada')).toMatchObject({pointer: expect.any(Object)});
  await ownerSecondTab.close();
  await expect.poll(async () => (await presences(friend)).some((presence) => presence.memberId === ownerPresence.memberId)).toBe(false);
  await owner.mouse.move(ownerBox.x + 400, ownerBox.y + 300);
  await expect.poll(async () => (await presences(friend)).filter((presence) => presence.memberId === ownerPresence.memberId)).toHaveLength(1);

  await owner.close();
  await expect.poll(async () => (await presences(friend)).some((presence) => presence.memberId === ownerPresence.memberId)).toBe(false);
  await friend.reload();
  await expect(friend.locator('.porch-canvas-engine')).toHaveAttribute('data-connection', 'open');
  await expect.poll(async () => (await presences(friend)).some((presence) => presence.memberId === ownerPresence.memberId)).toBe(false);

  await Promise.all([ownerContext.close(), friendContext.close()]);
});
