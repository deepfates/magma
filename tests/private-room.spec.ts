import {expect, test, type BrowserContext} from '@playwright/test';

const blockRemoteMedia = (context: BrowserContext) => context.route(
  /(youtube(?:-nocookie)?\.com|googlevideo\.com|ytimg\.com)/,
  (route) => route.abort(),
);

const parseInvitation = (text: string) => {
  const roomUrl = text.match(/https?:\/\/\S+/)?.[0];
  const capability = text.match(/mgi1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}/)?.[0];
  if (!roomUrl || !capability) throw new Error('Invitation did not contain a separate room URL and capability');
  return {roomUrl, capability};
};

test('a private room bootstraps one owner, enrolls by separated code, returns by proof, and rotates access', async ({browser}) => {
  const ownerContext = await browser.newContext({permissions: ['clipboard-read', 'clipboard-write']});
  const memberContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const rejectedContext = await browser.newContext();
  await Promise.all([blockRemoteMedia(ownerContext), blockRemoteMedia(memberContext), blockRemoteMedia(guestContext), blockRemoteMedia(rejectedContext)]);
  const owner = await ownerContext.newPage();
  const socketUrls: string[] = [];
  const invitationFrames: string[] = [];
  owner.on('websocket', (socket) => {
    socketUrls.push(socket.url());
    socket.on('framesent', (event) => {
      if (typeof event.payload !== 'string' || !event.payload.includes('access.invite.')) return;
      invitationFrames.push(`sent:${JSON.parse(event.payload).type}`);
    });
    socket.on('framereceived', (event) => {
      if (typeof event.payload !== 'string' || !event.payload.includes('access.invite.')) return;
      const parsed = JSON.parse(event.payload) as {type: string; reason?: string};
      invitationFrames.push(`received:${parsed.type}${parsed.reason ? `:${parsed.reason}` : ''}`);
    });
  });

  await owner.goto('/');
  await expect(owner).toHaveURL(/\?room=[0-9a-f-]{36}$/);
  await expect(owner.getByRole('heading', {name: 'Make a room'})).toBeVisible();
  await owner.getByLabel('Name', {exact: true}).fill('Ada');
  await owner.getByRole('button', {name: 'Create room'}).click();
  await expect(owner.getByRole('heading', {name: 'Your room is ready.'})).toBeVisible();
  await expect(owner.getByRole('button', {name: 'Enter without inviting'})).toBeVisible();
  await owner.getByRole('button', {name: 'Copy invitation'}).click();
  await expect.poll(() => invitationFrames).toContain('sent:access.invite.create');
  await expect.poll(() => invitationFrames.some((frame) => frame.startsWith('received:access.invite.'))).toBe(true);
  expect(invitationFrames).toContain('received:access.invite.created');
  const arrivalInvitation = owner.locator('.arrival-invitation-ready textarea');
  await expect(arrivalInvitation).toBeVisible();
  const firstPayload = await arrivalInvitation.inputValue();
  const firstInvitation = parseInvitation(firstPayload);
  expect(firstInvitation.roomUrl).not.toContain(firstInvitation.capability);
  await owner.getByRole('button', {name: 'Enter the room'}).click();
  await expect(owner.getByText('you hold the room tempo')).toBeVisible();

  const member = await memberContext.newPage();
  member.on('websocket', (socket) => socketUrls.push(socket.url()));
  await member.goto(firstInvitation.roomUrl);
  await expect(member.getByRole('heading', {name: /Enter this Magma room/})).toBeVisible();
  await member.getByLabel('Name', {exact: true}).fill('Lin');
  await member.getByLabel('Invitation code').fill(firstInvitation.capability);
  await member.getByRole('button', {name: 'Enter quietly'}).click();
  await expect(member.getByText('Ada holds the tempo')).toBeVisible();
  await expect(member).not.toHaveURL(new RegExp(firstInvitation.capability.replaceAll('.', '\\.')));
  await owner.getByRole('button', {name: 'Room', exact: true}).click();
  await expect(owner.getByText('2 people')).toBeVisible();

  await owner.reload();
  await owner.getByRole('button', {name: 'Room', exact: true}).click();
  await expect(owner.getByText('2 people')).toBeVisible();
  await expect(owner.getByText('Ada · you')).toBeVisible();
  expect(socketUrls.every((url) => !url.includes('Ada') && !url.includes('Lin') && !url.includes(firstInvitation.capability))).toBe(true);

  await owner.getByRole('button', {name: 'Remove Lin from room'}).click();
  await expect(member.getByRole('heading', {name: 'Your access has ended.'})).toBeVisible();
  await expect(member.locator('.media-stage iframe')).toHaveCount(0);
  const revokedRoom = new URL(firstInvitation.roomUrl).searchParams.get('room');
  await expect.poll(() => member.evaluate(async (roomId) => {
    const databases = await indexedDB.databases();
    return databases.some((database) => database.name === `magma:${roomId}`);
  }, revokedRoom)).toBe(false);
  await expect(owner.getByText('1 person')).toBeVisible();

  await owner.locator('.room-access-role-select select').selectOption('guest');
  const guestInvite = owner.locator('.room-access-actions').getByRole('button', {name: 'Create invitation'});
  const preparedInvitation = owner.getByLabel('Prepared invitation').locator('textarea');
  await guestInvite.click();
  await expect.poll(() => preparedInvitation.inputValue()).not.toBe(firstPayload);
  const guestInvitation = parseInvitation(await preparedInvitation.inputValue());
  const guest = await guestContext.newPage();
  await guest.goto(guestInvitation.roomUrl);
  await guest.getByLabel('Name', {exact: true}).fill('Grace');
  await guest.getByLabel('Invitation code').fill(guestInvitation.capability);
  await guest.getByRole('button', {name: 'Enter quietly'}).click();
  await expect(guest.getByText('Ada holds the tempo')).toBeVisible();
  await guest.getByRole('button', {name: 'Workspace', exact: true}).click();
  await expect(guest.getByText('Guests can read the workspace. A steward can invite you as a member to edit it.')).toBeVisible();
  await expect(guest.getByPlaceholder('What are we making real?')).toHaveCount(0);

  await owner.locator('.room-access-actions').getByRole('button', {name: 'Rotate invitation'}).click();
  await owner.getByRole('alertdialog').getByRole('button', {name: 'Rotate invitation'}).click();
  await expect(owner.getByText('New invitation ready. Previous links no longer open the room.')).toBeVisible();

  const rejected = await rejectedContext.newPage();
  await rejected.goto(firstInvitation.roomUrl);
  await rejected.getByLabel('Name', {exact: true}).fill('Mallory');
  await rejected.getByLabel('Invitation code').fill(firstInvitation.capability);
  await rejected.getByRole('button', {name: 'Enter quietly'}).click();
  await expect(rejected.getByText('That invitation code is expired, used, or no longer active.')).toBeVisible();

  await Promise.all([ownerContext.close(), memberContext.close(), guestContext.close(), rejectedContext.close()]);
});
