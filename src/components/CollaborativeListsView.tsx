import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckSquare,
  Copy,
  Loader2,
  MapPin,
  Plus,
  Route,
  Square,
  ThumbsUp,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { CollabList, CollabListItem, CollabListMember } from '../types';
import { PlaceAutocompleteInput, type ResolvedPlaceSelection } from './PlaceAutocompleteInput';

interface CollaborativeListsViewProps {
  user: User | null;
  onSignIn: () => Promise<void>;
  onBuildItineraryFromList: (destination: string, places: string[], title: string) => void;
}

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'WF-';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function makeSafeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CollaborativeListsView({
  user,
  onSignIn,
  onBuildItineraryFromList,
}: CollaborativeListsViewProps) {
  const [sharedLists, setSharedLists] = useState<CollabList[]>([]);
  const [ownedLists, setOwnedLists] = useState<CollabList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [members, setMembers] = useState<CollabListMember[]>([]);
  const [items, setItems] = useState<CollabListItem[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDestination, setNewDestination] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newVisibility, setNewVisibility] = useState<'shared' | 'private'>('shared');
  const [creating, setCreating] = useState(false);

  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinStatus, setJoinStatus] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const [newItemCategory, setNewItemCategory] = useState('Landmark');
  const [newItemNote, setNewItemNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Subscribe to shared lists and user's own lists when signed in
  useEffect(() => {
    if (!user) {
      setSharedLists([]);
      setOwnedLists([]);
      setSelectedListId(null);
      return;
    }

    setLoadingLists(true);
    const sharedQuery = query(
      collection(db, 'collabLists'),
      where('visibility', '==', 'shared')
    );
    const ownQuery = query(
      collection(db, 'collabLists'),
      where('ownerId', '==', user.uid)
    );

    const unsubShared = onSnapshot(
      sharedQuery,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CollabList, 'id'>) }));
        setSharedLists(docs);
        setLoadingLists(false);
      },
      (err) => {
        if ((err as { code?: string })?.code === 'unavailable') {
          setLoadingLists(false);
          return;
        }
        handleFirestoreError(err, OperationType.LIST, 'collabLists');
      }
    );

    const unsubOwn = onSnapshot(
      ownQuery,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CollabList, 'id'>) }));
        setOwnedLists(docs);
        setLoadingLists(false);
      },
      (err) => {
        if ((err as { code?: string })?.code === 'unavailable') {
          setLoadingLists(false);
          return;
        }
        handleFirestoreError(err, OperationType.LIST, 'collabLists');
      }
    );

    return () => {
      unsubShared();
      unsubOwn();
    };
  }, [user]);

  const allLists = useMemo(() => {
    const byId: Record<string, CollabList> = {};
    for (const l of [...ownedLists, ...sharedLists]) {
      byId[l.id] = l;
    }
    return Object.values(byId).sort((a, b) => {
      const aSec = a.createdAt?.seconds || 0;
      const bSec = b.createdAt?.seconds || 0;
      return bSec - aSec;
    });
  }, [ownedLists, sharedLists]);

  useEffect(() => {
    if (!selectedListId && allLists.length > 0) {
      setSelectedListId(allLists[0].id);
    }
  }, [allLists, selectedListId]);

  const activeList = useMemo(
    () => allLists.find((l) => l.id === selectedListId) ?? null,
    [allLists, selectedListId]
  );

  // Subscribe to members and items of selected list
  useEffect(() => {
    if (!user || !activeList) {
      setMembers([]);
      setItems([]);
      return;
    }

    const membersPath = `collabLists/${activeList.id}/members`;
    const itemsPath = `collabLists/${activeList.id}/items`;

    // Query explicitly aligned with rules (`listVisibility == 'shared'` or `listOwnerId == user.uid`)
    const membersQ =
      activeList.visibility === 'shared'
        ? query(collection(db, membersPath), where('listVisibility', '==', 'shared'))
        : query(collection(db, membersPath), where('listOwnerId', '==', user.uid));

    const itemsQ =
      activeList.visibility === 'shared'
        ? query(collection(db, itemsPath), where('listVisibility', '==', 'shared'), orderBy('createdAt', 'asc'))
        : query(collection(db, itemsPath), where('listOwnerId', '==', user.uid), orderBy('createdAt', 'asc'));

    let unsubFallbackItems: (() => void) | null = null;

    const unsubMembers = onSnapshot(
      membersQ,
      (snap) => {
        setMembers(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CollabListMember, 'id'>) }))
        );
      },
      (err) => {
        if ((err as { code?: string })?.code === 'unavailable') return;
        handleFirestoreError(err, OperationType.LIST, membersPath);
      }
    );

    const unsubItems = onSnapshot(
      itemsQ,
      (snap) => {
        setItems(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CollabListItem, 'id'>) }))
        );
      },
      (err) => {
        if ((err as { code?: string })?.code === 'unavailable') return;
        // Fallback without composite index orderBy if index isn't provisioned yet
        if (err.message.includes('index')) {
          const fallbackQ =
            activeList.visibility === 'shared'
              ? query(collection(db, itemsPath), where('listVisibility', '==', 'shared'))
              : query(collection(db, itemsPath), where('listOwnerId', '==', user.uid));
          unsubFallbackItems = onSnapshot(
            fallbackQ,
            (snap) => {
              const list = snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<CollabListItem, 'id'>) }))
                .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
              setItems(list);
            },
            (e2) => {
              if ((e2 as { code?: string })?.code === 'unavailable') return;
              handleFirestoreError(e2, OperationType.LIST, itemsPath);
            }
          );
        } else {
          handleFirestoreError(err, OperationType.LIST, itemsPath);
        }
      }
    );

    return () => {
      unsubMembers();
      unsubItems();
      unsubFallbackItems?.();
    };
  }, [user, activeList]);

  const isMember = useMemo(() => {
    if (!user || !activeList) return false;
    return activeList.ownerId === user.uid || members.some((m) => m.userId === user.uid);
  }, [user, activeList, members]);

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newTitle.trim() || !newDestination.trim()) {
      setActionError('Enter both a list title and destination.');
      return;
    }
    setCreating(true);
    setActionError(null);
    const listId = makeSafeId('list');
    const joinCode = generateJoinCode();

    try {
      await setDoc(doc(db, 'collabLists', listId), {
        ownerId: user.uid,
        ownerName: (user.displayName || 'Traveler').slice(0, 100),
        title: newTitle.trim().slice(0, 140),
        destination: newDestination.trim().slice(0, 120),
        description: newDescription.trim().slice(0, 800),
        joinCode,
        visibility: newVisibility,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Register owner membership record sequentially so parent exists() succeeds
      await setDoc(doc(db, `collabLists/${listId}/members`, user.uid), {
        userId: user.uid,
        displayName: (user.displayName || 'Traveler').slice(0, 100),
        role: 'owner',
        listOwnerId: user.uid,
        listVisibility: newVisibility,
        joinedAt: serverTimestamp(),
      });

      setNewTitle('');
      setNewDestination('');
      setNewDescription('');
      setShowCreateForm(false);
      setSelectedListId(listId);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `collabLists/${listId}`);
    } finally {
      setCreating(false);
    }
  };

  const handleJoinList = async (list: CollabList) => {
    if (!user) return;
    setActionError(null);
    const memberPath = `collabLists/${list.id}/members/${user.uid}`;
    try {
      await setDoc(doc(db, `collabLists/${list.id}/members`, user.uid), {
        userId: user.uid,
        displayName: (user.displayName || 'Traveler').slice(0, 100),
        role: list.ownerId === user.uid ? 'owner' : 'collaborator',
        listOwnerId: list.ownerId,
        listVisibility: list.visibility,
        joinedAt: serverTimestamp(),
      });
      setJoinStatus(`Joined "${list.title}"`);
      window.setTimeout(() => setJoinStatus(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, memberPath);
    }
  };

  const handleJoinByCode = async () => {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) return;
    const match = allLists.find((l) => l.joinCode.toUpperCase() === code);
    if (!match) {
      setJoinStatus('No shared list matched that invite code.');
      return;
    }
    setSelectedListId(match.id);
    if (user && match.ownerId !== user.uid && !members.some((m) => m.userId === user.uid)) {
      await handleJoinList(match);
    }
    setJoinCodeInput('');
  };

  const handleAddItem = async (place: ResolvedPlaceSelection) => {
    if (!user || !activeList) return;
    if (!isMember) {
      await handleJoinList(activeList);
    }
    const itemId = makeSafeId('item');
    const itemPath = `collabLists/${activeList.id}/items/${itemId}`;
    try {
      await setDoc(doc(db, `collabLists/${activeList.id}/items`, itemId), {
        listId: activeList.id,
        listOwnerId: activeList.ownerId,
        listVisibility: activeList.visibility,
        addedByUid: user.uid,
        addedByName: (user.displayName || 'Traveler').slice(0, 100),
        placeName: place.name.slice(0, 160),
        address: (place.formattedAddress || '').slice(0, 240),
        ...(place.placeId ? { placeId: place.placeId.slice(0, 200) } : {}),
        category: newItemCategory.slice(0, 60),
        note: newItemNote.trim().slice(0, 500),
        visited: false,
        votes: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewItemNote('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, itemPath);
    }
  };

  const handleToggleVisited = async (item: CollabListItem) => {
    if (!activeList) return;
    const path = `collabLists/${activeList.id}/items/${item.id}`;
    try {
      await updateDoc(doc(db, `collabLists/${activeList.id}/items`, item.id), {
        visited: !item.visited,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleUpvoteItem = async (item: CollabListItem) => {
    if (!activeList) return;
    const path = `collabLists/${activeList.id}/items/${item.id}`;
    try {
      await updateDoc(doc(db, `collabLists/${activeList.id}/items`, item.id), {
        votes: Math.min(10000, (item.votes || 0) + 1),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleDeleteItem = async (item: CollabListItem) => {
    if (!activeList) return;
    const path = `collabLists/${activeList.id}/items/${item.id}`;
    try {
      await deleteDoc(doc(db, `collabLists/${activeList.id}/items`, item.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <div className="liquid-glass rounded-[30px] p-10">
          <div className="w-12 h-12 rounded-2xl liquid-glass-popover flex items-center justify-center text-[#007AFF] mx-auto mb-4">
            <Users className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-950">
            Collaborative Travel Lists
          </h1>
          <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
            Sign in with Google to create real-time shared wishlists with travel companions, upvote must-see landmarks, track visited spots, and convert any list into an optimized AI itinerary.
          </p>
          <button
            type="button"
            onClick={() => void onSignIn()}
            className="mt-6 liquid-btn-primary px-6 py-2.5 text-sm font-semibold rounded-full whitespace-nowrap cursor-pointer"
          >
            Sign In with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-semibold text-[#007AFF] mb-1.5">
            Real-time group trip planning · Synced across devices
          </p>
          <h1 className="text-3xl font-semibold text-slate-950 tracking-tight">
            Collaborative Travel Lists
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              placeholder="Invite code (WF-...)"
              className="w-40 px-3.5 py-2 text-xs font-mono liquid-glass-input rounded-full text-slate-900 placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => void handleJoinByCode()}
              className="liquid-btn-glass px-3.5 py-2 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer"
            >
              Join
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="liquid-btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New List
          </button>
        </div>
      </div>

      {joinStatus && (
        <div className="mb-4 px-4 py-2.5 bg-sky-50/85 backdrop-blur-xl border border-sky-200/80 rounded-2xl text-xs text-sky-950 shadow-sm">
          {joinStatus}
        </div>
      )}

      {showCreateForm && (
        <form
          onSubmit={(e) => void handleCreateList(e)}
          className="mb-6 liquid-glass rounded-[28px] p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-950">Create Collaborative List</h2>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">List title</label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Kyoto Autumn Architecture"
                className="w-full px-3.5 py-2.5 text-sm liquid-glass-input rounded-2xl text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">Destination</label>
              <input
                type="text"
                required
                value={newDestination}
                onChange={(e) => setNewDestination(e.target.value)}
                placeholder="e.g. Kyoto, Japan"
                className="w-full px-3.5 py-2.5 text-sm liquid-glass-input rounded-2xl text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">Access</label>
              <select
                value={newVisibility}
                onChange={(e) => setNewVisibility(e.target.value as 'shared' | 'private')}
                className="w-full px-3.5 py-2.5 text-sm liquid-glass-input rounded-2xl text-slate-900"
              >
                <option value="shared">Shared (travelers can join &amp; collaborate)</option>
                <option value="private">Private (only you)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">Notes for companions</label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Add cafes, hidden temples, or sunset viewpoints we shouldn't miss."
              className="w-full px-3.5 py-2.5 text-sm liquid-glass-input rounded-2xl text-slate-900"
            />
          </div>

          {actionError && <p className="text-xs text-[#DC2626]">{actionError}</p>}

          <button
            type="submit"
            disabled={creating}
            className="liquid-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-full disabled:opacity-50 cursor-pointer"
          >
            {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Create List
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar: Lists Directory */}
        <div className="lg:col-span-4 liquid-glass rounded-[28px] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/60 text-xs font-semibold text-slate-800 bg-white/35">
            Lists ({allLists.length})
          </div>
          {loadingLists ? (
            <div className="p-8 text-center text-xs text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[#007AFF]" />
              Loading collaborative lists...
            </div>
          ) : allLists.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-semibold text-slate-800">No collaborative lists yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Create your first shared list to co-plan stops with friends.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-900/6">
              {allLists.map((list) => {
                const active = list.id === selectedListId;
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => setSelectedListId(list.id)}
                    className={`w-full text-left px-5 py-3.5 transition-colors cursor-pointer ${
                      active ? 'bg-sky-500/12' : 'hover:bg-white/45'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-semibold truncate ${active ? 'text-[#007AFF]' : 'text-slate-900'}`}>
                        {list.title}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 shrink-0">
                        {list.visibility}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 truncate">
                      {list.destination} · by {list.ownerName}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Workspace: Selected List Details & Live Items */}
        <div className="lg:col-span-8 liquid-glass rounded-[28px] p-6 min-h-[460px]">
          {activeList ? (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-900/8">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-950">{activeList.title}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{activeList.destination}</span>
                    <span aria-hidden="true">·</span>
                    <span>Created by {activeList.ownerName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{members.length} collaborator{members.length === 1 ? '' : 's'}</span>
                  </div>
                  {activeList.description && (
                    <p className="mt-2 text-sm text-slate-600">{activeList.description}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(activeList.joinCode);
                      setCopiedCode(true);
                      window.setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    className="liquid-btn-glass inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono rounded-full whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-[#16A34A]" /> : <Copy className="w-3.5 h-3.5 text-slate-600" />}
                    {activeList.joinCode}
                  </button>

                  {!isMember && activeList.visibility === 'shared' && (
                    <button
                      type="button"
                      onClick={() => void handleJoinList(activeList)}
                      className="liquid-btn-primary inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Join List
                    </button>
                  )}

                  {items.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        onBuildItineraryFromList(
                          activeList.destination,
                          items.map((it) => it.placeName),
                          activeList.title
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-slate-900/90 hover:bg-slate-900 border border-white/20 shadow-md rounded-full whitespace-nowrap shrink-0 transition-all cursor-pointer"
                    >
                      <Route className="w-3.5 h-3.5" />
                      Generate Itinerary ({items.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Collaborators Roster */}
              {members.length > 0 && (
                <div className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">Collaborators:</span>{' '}
                  {members.map((m) => m.displayName).join(' · ')}
                </div>
              )}

              {/* Add Place Bar */}
              {isMember ? (
                <div className="p-4 liquid-glass-subtle rounded-[20px] space-y-3">
                  <div className="text-xs font-semibold text-slate-800">
                    Add a place to this collaborative list
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <select
                      value={newItemCategory}
                      onChange={(e) => setNewItemCategory(e.target.value)}
                      className="px-3.5 py-2 text-xs liquid-glass-input rounded-2xl text-slate-900"
                    >
                      <option value="Landmark">Landmark</option>
                      <option value="Museum & Culture">Museum &amp; Culture</option>
                      <option value="Food & Cafe">Food &amp; Cafe</option>
                      <option value="Viewpoint">Viewpoint</option>
                      <option value="Neighborhood">Neighborhood</option>
                    </select>
                    <input
                      type="text"
                      value={newItemNote}
                      onChange={(e) => setNewItemNote(e.target.value)}
                      placeholder="Short note (e.g. Go before 9am)"
                      className="sm:col-span-2 px-3.5 py-2 text-xs liquid-glass-input rounded-2xl text-slate-900 placeholder:text-slate-400"
                    />
                  </div>
                  <PlaceAutocompleteInput
                    clearOnSelect
                    submitLabel="Add to List"
                    onPlaceSelect={(p) => void handleAddItem(p)}
                    placeholder={`Search a place in ${activeList.destination}...`}
                  />
                </div>
              ) : (
                <div className="p-4 liquid-glass-subtle rounded-[20px] text-xs text-slate-700 flex items-center justify-between gap-3">
                  <span>Join this shared list to add places, vote, and check off visited spots.</span>
                  <button
                    type="button"
                    onClick={() => void handleJoinList(activeList)}
                    className="liquid-btn-primary px-4 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap cursor-pointer"
                  >
                    Join Now
                  </button>
                </div>
              )}

              {/* Items Table / Rows */}
              {items.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No places added yet. Use the Google Places search above to start curating stops together.
                </div>
              ) : (
                <div className="divide-y divide-slate-900/8">
                  {items.map((item) => (
                    <div key={item.id} className="py-3.5 flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <button
                          type="button"
                          disabled={!isMember}
                          onClick={() => void handleToggleVisited(item)}
                          aria-label={item.visited ? 'Mark unvisited' : 'Mark visited'}
                          className="mt-0.5 text-slate-500 hover:text-[#007AFF] disabled:opacity-40 shrink-0 cursor-pointer"
                        >
                          {item.visited ? (
                            <CheckSquare className="w-4 h-4 text-[#16A34A]" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                        <div className="min-w-0">
                          <div className={`text-sm font-semibold ${item.visited ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                            {item.placeName}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {item.category} · added by {item.addedByName}
                          </div>
                          {item.address && (
                            <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{item.address}</span>
                            </div>
                          )}
                          {item.note && (
                            <p className="text-xs text-slate-700 mt-1.5">{item.note}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={!isMember}
                          onClick={() => void handleUpvoteItem(item)}
                          className="liquid-btn-glass inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono tabular-nums disabled:opacity-40 rounded-full cursor-pointer"
                        >
                          <ThumbsUp className="w-3 h-3 text-[#007AFF]" />
                          {item.votes}
                        </button>
                        {(activeList.ownerId === user.uid || item.addedByUid === user.uid) && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteItem(item)}
                            aria-label="Remove item"
                            className="p-1.5 text-slate-400 hover:text-[#DC2626] rounded-full hover:bg-white/60 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="h-full min-h-[380px] flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl liquid-glass-subtle flex items-center justify-center text-slate-400 mb-3">
                <Users className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-800">Select or create a travel list</p>
              <p className="text-xs text-slate-500 mt-1">
                Collaborate on destinations in real time and turn them into mapped itineraries.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
