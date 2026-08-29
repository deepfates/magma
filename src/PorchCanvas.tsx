import {useEffect, useMemo, useRef, type ReactNode} from 'react';
import {useSync} from '@tldraw/sync';
import {getAssetUrlsByImport} from '@tldraw/assets/imports.vite';
import {
  atom, computed, createUserId, defaultBindingUtils, defaultShapeUtils, inlineBase64AssetStore, Tldraw,
  type Editor, type TLUserPreferences, type TLUserStore,
  UserRecordType, useTldrawCurrentUser,
} from 'tldraw';
import 'tldraw/tldraw.css';
import {partyHost} from './accessClient';
import type {RoomAdmission} from './accessClient';
import type {Profile} from './domain/protocol';

export type PorchTool = 'select' | 'draw' | 'note';

const shapeUtils: [] = [];
const assetUrls = getAssetUrlsByImport();
const components = {
  ActionsMenu: null, DebugMenu: null, HelpMenu: null, KeyboardShortcutsDialog: null,
  MainMenu: null, NavigationPanel: null, PageMenu: null, QuickActions: null,
  SharePanel: null, StylePanel: null, Toolbar: null, ZoomMenu: null,
};

function UserBridge({profile, children}: {profile: Profile; children: (users: TLUserStore, user: ReturnType<typeof useTldrawCurrentUser>) => ReactNode}) {
  const preferences = useMemo<TLUserPreferences>(() => ({id: profile.memberId, name: profile.name, color: profile.color, colorScheme: 'dark'}), [profile.memberId, profile.name, profile.color]);
  const preferencesAtom = useRef(atom<TLUserPreferences>('porch-user', preferences)).current;
  useEffect(() => { preferencesAtom.set(preferences); }, [preferences, preferencesAtom]);
  const users = useMemo<TLUserStore>(() => ({
    currentUser: computed('porch-current-user', () => {
      const value = preferencesAtom.get();
      return UserRecordType.create({id: createUserId(value.id), name: value.name ?? '', color: value.color ?? ''});
    }),
  }), [preferencesAtom]);
  const user = useTldrawCurrentUser({userPreferences: preferences, setUserPreferences: () => undefined});
  return children(users, user);
}

function SyncedCanvas({room, profile, tool, refreshAdmission}: {room: string; profile: Profile; tool: PorchTool; refreshAdmission?: () => Promise<RoomAdmission>}) {
  return <UserBridge profile={profile}>{(users, user) => <SyncedEditor room={room} users={users} user={user} tool={tool} refreshAdmission={refreshAdmission} />}</UserBridge>;
}

function SyncedEditor({room, users, user, tool, refreshAdmission}: {room: string; users: TLUserStore; user: ReturnType<typeof useTldrawCurrentUser>; tool: PorchTool; refreshAdmission?: () => Promise<RoomAdmission>}) {
  const editorRef = useRef<Editor | null>(null);
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  const syncHost = import.meta.env.VITE_TLDRAW_SYNC_HOST || `${protocol}://${partyHost()}/parties/canvas`;
  const uri = useMemo(() => async () => {
    const admission = refreshAdmission ? await refreshAdmission() : null;
    const params = admission ? `?admission=${encodeURIComponent(admission.ticket)}` : '';
    return `${syncHost}/${encodeURIComponent(room)}${params}`;
  }, [refreshAdmission, room, syncHost]);
  const store = useSync({uri, users, shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils, assets: inlineBase64AssetStore});
  useEffect(() => { editorRef.current?.setCurrentTool(tool); }, [tool]);
  if (store.status === 'loading') return <div className="porch-canvas-status">Opening the glass…</div>;
  if (store.status === 'error') return <div className="porch-canvas-status error">The glass could not connect.</div>;
  return <Tldraw
    store={store.store}
    user={user}
    shapeUtils={shapeUtils}
    components={components}
    options={{maxPages: 1, maxFontsToLoadBeforeRender: 0}}
    assetUrls={assetUrls}
    licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
    onMount={(editor) => { editorRef.current = editor; editor.setCurrentTool(tool); }}
  />;
}

export function PorchCanvas({room, profile, refreshAdmission, glassVisible, tool}: {
  room: string;
  profile: Profile;
  refreshAdmission?: () => Promise<RoomAdmission>;
  glassVisible: boolean;
  tool: PorchTool;
}) {
  return <div className={`porch-canvas-adapter ${glassVisible ? '' : 'glass-hidden'}`} aria-label="Shared porch canvas">
    <SyncedCanvas room={room} profile={profile} tool={tool} refreshAdmission={refreshAdmission} />
  </div>;
}
