import React, { useEffect, useMemo, useState } from 'react';
import {
  Heart,
  Loader2,
  MapPin,
  MessageSquare,
  PenLine,
  Search,
  Send,
  Volume2,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { ExperienceComment, TravelExperience } from '../types';

const EDITORIAL_COVERS = [
  {
    label: 'Kyoto Morning Street',
    url: '/src/assets/images/exp_kyoto_temple_1795096393382.jpg',
  },
  {
    label: 'Mediterranean Loggia',
    url: '/src/assets/images/exp_amalfi_coast_1795096409111.jpg',
  },
  {
    label: 'Lisbon Azulejo Lane',
    url: '/src/assets/images/exp_lisbon_alley_1795096384508.jpg',
  },
  {
    label: 'Coastal Cliffside',
    url: '/src/assets/images/hero_editorial_atlas_1795096381842.jpg',
  },
];

const CURATED_EXPERIENCES: TravelExperience[] = [
  {
    id: 'curated-kyoto-dawn',
    authorId: 'editorial',
    authorName: 'Hana Takahashi',
    title: 'Before the Crowds Along Higashiyama Stone Lanes',
    location: 'Kyoto',
    country: 'Japan',
    travelDate: 'October 2026',
    summary: 'Walking Ninen-zaka and Sannen-zaka at 6:30 AM reveals cedar lattice facades, mist over Yasaka Pagoda, and quiet temple bells.',
    story:
      'Setting an alarm before sunrise completely transformed our Kyoto itinerary. Starting at Kiyomizu-dera right as the gates opened, we walked north along Sannen-zaka while the flagstones were still damp from overnight rain. Shops were closed, paper lanterns remained softly lit, and the cedar scent from surrounding hillside groves filled the air. By 8:30 AM we stopped at a tiny kissaten for hand-drip coffee before continuing toward Maruyama Park.',
    tips: 'Arrive at Kiyomizu-dera by 06:15 AM, wear cushioned walking shoes for wet stone steps, and save souvenir browsing for late afternoon.',
    imageUrl: '/src/assets/images/exp_kyoto_temple_1795096393382.jpg',
    tags: ['Kyoto', 'Morning Walk', 'Architecture'],
    likesCount: 42,
    isPublished: true,
    isCuratedEditorial: true,
  },
  {
    id: 'curated-amalfi-terrace',
    authorId: 'editorial',
    authorName: 'Lorenzo Bellini',
    title: 'Stone Cloisters and High Trails Above the Amalfi Coast',
    location: 'Ravello & Amalfi',
    country: 'Italy',
    travelDate: 'September 2026',
    summary: 'Skipping highway traffic by taking the medieval stairways from Villa Cimbrone down through lemon groves to Atrani.',
    story:
      'Most visitors experience the Amalfi Coast through bus windows, but the ancient mule paths connecting Ravello, Pontone, and Amalfi are peaceful and shaded by terraced lemon pergolas. We spent the morning wandering Ravello’s vaulted stone terraces overlooking the Tyrrhenian Sea, then descended slowly into Amalfi for sfogliatella and a ferry ride along the cliffs.',
    tips: 'Take the morning bus uphill to Ravello, then walk downhill to Amalfi—your knees and schedule will both thank you.',
    imageUrl: '/src/assets/images/exp_amalfi_coast_1795096409111.jpg',
    tags: ['Italy', 'Coastal Trail', 'Heritage'],
    likesCount: 36,
    isPublished: true,
    isCuratedEditorial: true,
  },
  {
    id: 'curated-lisbon-tiles',
    authorId: 'editorial',
    authorName: 'Sofia Mendes',
    title: 'Following Tram Rails Through Alfama and Graça',
    location: 'Lisbon',
    country: 'Portugal',
    travelDate: 'August 2026',
    summary: 'A self-paced walking loop connecting Miradouro da Senhora do Monte, azulejo workshops, and hidden courtyard fado taverns.',
    story:
      'Rather than waiting in the long queue for Tram 28 at Martim Moniz, we walked uphill to Miradouro da Senhora do Monte and traced the yellow rails downhill through Graça and Alfama. Every corner revealed hand-painted eighteenth-century azulejo panels, laundry swaying in Atlantic breezes, and small neighborhood bakeries pulling warm pastéis de nata from the oven.',
    tips: 'Start at the highest miradouro and descend toward the Tagus River so gravity works with you all afternoon.',
    imageUrl: '/src/assets/images/exp_lisbon_alley_1795096384508.jpg',
    tags: ['Lisbon', 'Walking Route', 'Tiles'],
    likesCount: 29,
    isPublished: true,
    isCuratedEditorial: true,
  },
];

interface TravelJournalViewProps {
  user: User | null;
  onSignIn: () => Promise<void>;
  onPlayAudioGuide: (opts: { mode: 'guide'; title: string; script: string }) => Promise<void>;
  initialDraft: {
    title: string;
    location: string;
    country: string;
    summary: string;
    tips: string;
    imageUrl: string;
  } | null;
  onClearInitialDraft: () => void;
}

export function TravelJournalView({
  user,
  onSignIn,
  onPlayAudioGuide,
  initialDraft,
  onClearInitialDraft,
}: TravelJournalViewProps) {
  const [communityPosts, setCommunityPosts] = useState<TravelExperience[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPost, setSelectedPost] = useState<TravelExperience | null>(null);
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<ExperienceComment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const [showComposer, setShowComposer] = useState(false);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [country, setCountry] = useState('');
  const [travelDate, setTravelDate] = useState('November 2026');
  const [summary, setSummary] = useState('');
  const [story, setStory] = useState('');
  const [tips, setTips] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [imageUrl, setImageUrl] = useState(EDITORIAL_COVERS[0].url);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    if (initialDraft) {
      setTitle(initialDraft.title);
      setLocation(initialDraft.location);
      setCountry(initialDraft.country);
      setSummary(initialDraft.summary);
      setStory(initialDraft.summary);
      setTips(initialDraft.tips);
      setImageUrl(initialDraft.imageUrl || EDITORIAL_COVERS[0].url);
      setShowComposer(true);
      onClearInitialDraft();
    }
  }, [initialDraft, onClearInitialDraft]);

  // Listen to published community travel experiences in Firestore
  useEffect(() => {
    const q = query(collection(db, 'experiences'), where('isPublished', '==', true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<TravelExperience, 'id'>) }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setCommunityPosts(docs);
      },
      (err) => {
        if ((err as { code?: string })?.code === 'unavailable') return;
        handleFirestoreError(err, OperationType.LIST, 'experiences');
      }
    );
    return () => unsub();
  }, []);

  const allPosts = useMemo(() => [...communityPosts, ...CURATED_EXPERIENCES], [communityPosts]);

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allPosts;
    return allPosts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [allPosts, searchQuery]);

  // Sync selected post updates (e.g. live likesCount)
  const activePost = useMemo(() => {
    if (!selectedPost) return null;
    return allPosts.find((p) => p.id === selectedPost.id) ?? selectedPost;
  }, [allPosts, selectedPost]);

  // Check if current user liked active post & subscribe to comments
  useEffect(() => {
    if (!activePost || activePost.isCuratedEditorial) {
      setComments([]);
      return;
    }

    const commentsPath = `experiences/${activePost.id}/comments`;
    const commentsQ = query(
      collection(db, commentsPath),
      where('experiencePublished', '==', true)
    );
    const unsubComments = onSnapshot(
      commentsQ,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ExperienceComment, 'id'>) }))
          .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        setComments(list);
      },
      (err) => {
        if ((err as { code?: string })?.code === 'unavailable') return;
        handleFirestoreError(err, OperationType.LIST, commentsPath);
      }
    );

    if (user) {
      void getDoc(doc(db, `experiences/${activePost.id}/likes`, user.uid))
        .then((snap) => {
          setLikedIds((prev) => ({ ...prev, [activePost.id]: snap.exists() }));
        })
        .catch(() => {});
    }

    return () => unsubComments();
  }, [activePost?.id, activePost?.isCuratedEditorial, user]);

  const handlePublishExperience = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await onSignIn();
      return;
    }
    if (!title.trim() || !location.trim() || !country.trim() || !story.trim()) {
      setPublishError('Please fill in title, location, country, and your travel story.');
      return;
    }

    setPublishing(true);
    setPublishError(null);

    const expId = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const parsedTags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8);

    const safeImageUrl = imageUrl.startsWith('data:') ? EDITORIAL_COVERS[0].url : imageUrl.slice(0, 600);

    try {
      await setDoc(doc(db, 'experiences', expId), {
        authorId: user.uid,
        authorName: (user.displayName || 'Traveler').slice(0, 100),
        title: title.trim().slice(0, 160),
        location: location.trim().slice(0, 120),
        country: country.trim().slice(0, 80),
        travelDate: travelDate.trim().slice(0, 40) || 'Recent Trip',
        summary: (summary.trim() || story.trim().slice(0, 180)).slice(0, 400),
        story: story.trim().slice(0, 4000),
        tips: tips.trim().slice(0, 1000),
        imageUrl: safeImageUrl,
        tags: parsedTags.length > 0 ? parsedTags : [location.trim().slice(0, 30)],
        likesCount: 0,
        isPublished: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setTitle('');
      setLocation('');
      setCountry('');
      setSummary('');
      setStory('');
      setTips('');
      setTagsText('');
      setShowComposer(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `experiences/${expId}`);
    } finally {
      setPublishing(false);
    }
  };

  // Atomic Like toggle complying with Pillar 7 (existsAfter / getAfter)
  const handleToggleLike = async (post: TravelExperience) => {
    if (post.isCuratedEditorial) {
      setLikedIds((prev) => ({ ...prev, [post.id]: !prev[post.id] }));
      return;
    }
    if (!user) {
      await onSignIn();
      return;
    }

    const alreadyLiked = Boolean(likedIds[post.id]);
    const expRef = doc(db, 'experiences', post.id);
    const likeRef = doc(db, `experiences/${post.id}/likes`, user.uid);
    const batch = writeBatch(db);

    try {
      if (alreadyLiked) {
        batch.delete(likeRef);
        batch.update(expRef, { likesCount: increment(-1) });
      } else {
        batch.set(likeRef, {
          userId: user.uid,
          experienceId: post.id,
          createdAt: serverTimestamp(),
        });
        batch.update(expRef, { likesCount: increment(1) });
      }
      await batch.commit();
      setLikedIds((prev) => ({ ...prev, [post.id]: !alreadyLiked }));
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `experiences/${post.id}/likes/${user.uid}`);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePost || activePost.isCuratedEditorial || !commentBody.trim()) return;
    if (!user) {
      await onSignIn();
      return;
    }
    setPostingComment(true);
    const commentId = `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const path = `experiences/${activePost.id}/comments/${commentId}`;
    try {
      await setDoc(doc(db, `experiences/${activePost.id}/comments`, commentId), {
        experienceId: activePost.id,
        experiencePublished: true,
        authorId: user.uid,
        authorName: (user.displayName || 'Traveler').slice(0, 100),
        body: commentBody.trim().slice(0, 800),
        createdAt: serverTimestamp(),
      });
      setCommentBody('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    } finally {
      setPostingComment(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-semibold text-[#007AFF] mb-1.5">
            Community dispatches · First-hand field notes &amp; visitor tips
          </p>
          <h1 className="text-3xl font-semibold text-slate-950 tracking-tight">
            Travel Experiences Journal
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by city, country, tag..."
              className="pl-10 pr-4 py-2 text-xs liquid-glass-input rounded-full text-slate-900 placeholder:text-slate-400 w-56"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (!user) {
                void onSignIn();
              } else {
                setShowComposer(true);
              }
            }}
            className="liquid-btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer"
          >
            <PenLine className="w-3.5 h-3.5" />
            Share Experience
          </button>
        </div>
      </div>

      {/* Editorial Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPosts.map((post) => {
          const isLiked = Boolean(likedIds[post.id]);
          const displayLikes = post.isCuratedEditorial
            ? post.likesCount + (isLiked ? 1 : 0)
            : post.likesCount;

          return (
            <article
              key={post.id}
              className="liquid-glass liquid-card-interactive rounded-[26px] overflow-hidden flex flex-col justify-between"
            >
              <div>
                <button
                  type="button"
                  onClick={() => setSelectedPost(post)}
                  className="block w-full text-left overflow-hidden bg-slate-200/60 aspect-[4/3] cursor-pointer"
                >
                  <img
                    src={post.imageUrl || EDITORIAL_COVERS[0].url}
                    alt={post.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover hover:scale-[1.03] transition-transform duration-300"
                  />
                </button>
                <div className="p-5">
                  <div className="text-xs text-slate-500">
                    {post.location}, {post.country} · {post.travelDate}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPost(post)}
                    className="mt-1.5 text-left text-lg font-editorial font-semibold text-slate-950 hover:text-[#007AFF] leading-snug block transition-colors cursor-pointer"
                  >
                    {post.title}
                  </button>
                  <p className="mt-2 text-xs text-slate-600 leading-relaxed line-clamp-3">
                    {post.summary}
                  </p>
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-slate-900/6 bg-white/25 flex items-center justify-between text-xs text-slate-500">
                <span className="truncate">By {post.authorName}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleToggleLike(post)}
                    className={`inline-flex items-center gap-1 font-mono tabular-nums transition-colors cursor-pointer ${
                      isLiked ? 'text-[#DC2626]' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-current' : ''}`} />
                    {displayLikes}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPost(post)}
                    className="font-semibold text-[#007AFF] hover:underline cursor-pointer"
                  >
                    Read
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Story Reading Modal */}
      {activePost && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setSelectedPost(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="liquid-glass-popover rounded-[30px] max-w-3xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="relative h-72 bg-slate-900">
              <img
                src={activePost.imageUrl || EDITORIAL_COVERS[0].url}
                alt={activePost.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => setSelectedPost(null)}
                aria-label="Close story"
                className="absolute top-4 right-4 w-9 h-9 rounded-full liquid-glass-dark text-white hover:scale-105 transition-transform flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-7 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#007AFF]" />
                  <span>
                    {activePost.location}, {activePost.country} · {activePost.travelDate} · By {activePost.authorName}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void onPlayAudioGuide({
                        mode: 'guide',
                        title: activePost.title,
                        script: `${activePost.title}, by ${activePost.authorName}. ${activePost.story} Traveler tip: ${activePost.tips}`,
                      })
                    }
                    className="liquid-btn-glass inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-[#007AFF]" />
                    Listen
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleLike(activePost)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono tabular-nums rounded-full transition-colors cursor-pointer ${
                      likedIds[activePost.id]
                        ? 'text-[#DC2626] border border-red-200/90 bg-red-50/85'
                        : 'liquid-btn-glass'
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${likedIds[activePost.id] ? 'fill-current' : ''}`} />
                    {activePost.isCuratedEditorial
                      ? activePost.likesCount + (likedIds[activePost.id] ? 1 : 0)
                      : activePost.likesCount}
                  </button>
                </div>
              </div>

              <h2 className="text-2xl sm:text-3xl font-semibold text-slate-950 leading-tight">
                {activePost.title}
              </h2>

              <p className="text-sm sm:text-base text-slate-700 leading-relaxed whitespace-pre-line">
                {activePost.story}
              </p>

              {activePost.tips && (
                <div className="p-4 liquid-glass-subtle rounded-2xl">
                  <div className="text-xs font-semibold text-slate-900 mb-1">Field Tip for Future Travelers</div>
                  <p className="text-xs text-slate-700 leading-relaxed">{activePost.tips}</p>
                </div>
              )}

              {activePost.tags.length > 0 && (
                <div className="text-xs text-slate-500">
                  Topics: {activePost.tags.join(' · ')}
                </div>
              )}

              {/* Comments Section for Firestore-backed Community Posts */}
              {!activePost.isCuratedEditorial && (
                <div className="pt-5 border-t border-slate-900/10 space-y-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                    <MessageSquare className="w-3.5 h-3.5 text-[#007AFF]" />
                    Traveler Notes ({comments.length})
                  </div>

                  {comments.length > 0 && (
                    <div className="space-y-2.5">
                      {comments.map((c) => (
                        <div key={c.id} className="p-3.5 liquid-glass-subtle rounded-2xl text-xs">
                          <div className="font-semibold text-slate-900">{c.authorName}</div>
                          <p className="text-slate-700 mt-1 leading-relaxed">{c.body}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <form onSubmit={(e) => void handlePostComment(e)} className="flex gap-2">
                    <input
                      type="text"
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      placeholder={user ? 'Add a question or note for the author...' : 'Sign in to leave a note'}
                      className="flex-1 px-4 py-2 text-xs liquid-glass-input rounded-full text-slate-900 placeholder:text-slate-400"
                    />
                    <button
                      type="submit"
                      disabled={postingComment || !commentBody.trim()}
                      className="liquid-btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold disabled:opacity-50 rounded-full whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {postingComment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Post
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Publish Experience Composer Modal */}
      {showComposer && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowComposer(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void handlePublishExperience(e)}
            className="liquid-glass-popover rounded-[30px] max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-900/10">
              <h2 className="text-xl font-semibold text-slate-950">Share Your Travel Experience</h2>
              <button
                type="button"
                onClick={() => setShowComposer(false)}
                className="p-1.5 rounded-full text-slate-500 hover:text-slate-900 hover:bg-white/60 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">Story headline</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Golden Hour Overlooking the Old Town Walls"
                className="w-full px-3.5 py-2.5 text-sm liquid-glass-input rounded-2xl text-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">City / Place</label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Dubrovnik"
                  className="w-full px-3.5 py-2.5 text-sm liquid-glass-input rounded-2xl text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Country</label>
                <input
                  type="text"
                  required
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="e.g. Croatia"
                  className="w-full px-3.5 py-2.5 text-sm liquid-glass-input rounded-2xl text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">When you visited</label>
                <input
                  type="text"
                  value={travelDate}
                  onChange={(e) => setTravelDate(e.target.value)}
                  placeholder="e.g. October 2026"
                  className="w-full px-3.5 py-2.5 text-sm liquid-glass-input rounded-2xl text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5">Cover scene</label>
              <div className="grid grid-cols-4 gap-2.5">
                {EDITORIAL_COVERS.map((cover) => (
                  <button
                    key={cover.url}
                    type="button"
                    onClick={() => setImageUrl(cover.url)}
                    className={`rounded-2xl overflow-hidden border-2 transition-all cursor-pointer ${
                      imageUrl === cover.url ? 'border-[#007AFF] shadow-md' : 'border-white/70 opacity-85 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={cover.url}
                      alt={cover.label}
                      referrerPolicy="no-referrer"
                      className="w-full h-14 object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">Short summary</label>
              <input
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="One sentence capturing the essence of your visit."
                className="w-full px-3.5 py-2.5 text-sm liquid-glass-input rounded-2xl text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">Full experience &amp; route notes</label>
              <textarea
                rows={4}
                required
                value={story}
                onChange={(e) => setStory(e.target.value)}
                placeholder="Share what surprised you, how you paced your day, and what made this destination memorable..."
                className="w-full px-3.5 py-2.5 text-sm liquid-glass-input rounded-2xl text-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Practical tip for travelers</label>
                <input
                  type="text"
                  value={tips}
                  onChange={(e) => setTips(e.target.value)}
                  placeholder="Best entrance, timing, or local spot nearby"
                  className="w-full px-3.5 py-2.5 text-sm liquid-glass-input rounded-2xl text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Tags (comma separated)</label>
                <input
                  type="text"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="Architecture, Sunset, Walking"
                  className="w-full px-3.5 py-2.5 text-sm liquid-glass-input rounded-2xl text-slate-900"
                />
              </div>
            </div>

            {publishError && <p className="text-xs text-[#DC2626]">{publishError}</p>}

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowComposer(false)}
                className="liquid-btn-glass px-4 py-2 text-xs font-semibold rounded-full cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={publishing}
                className="liquid-btn-primary inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold disabled:opacity-50 rounded-full cursor-pointer"
              >
                {publishing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Publish Experience
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
