import type { FrostedAnimalDef } from "./types";

/**
 * Frosted Valley's story / envelope notes — every narrative, objective,
 * tutorial and celebration line the guided Rabbit and Fox chapters show,
 * plus the one-time ids they persist under (FrostedValleySaveState.storyNotesSeen).
 *
 * Pure data + pure helpers only (no Phaser), so the progression rules here
 * are unit-testable. FrostedStoryDirector turns this into the actual flow;
 * FrostedNoteScene draws it.
 *
 * Animals with no entry in FROSTED_STORY keep the original Request-screen
 * flow untouched.
 */

/**
 * A. story — what happened · B. objective — what to do next ·
 * C. tutorial — a mechanic, first time only · D. celebration — a short "yay".
 */
export type StoryNoteKind = "story" | "objective" | "tutorial" | "celebration";

export interface StoryNoteDef {
  /** Unique id; for one-time notes this is also the persisted "seen" flag. */
  id: string;
  kind: StoryNoteKind;
  /** First line, drawn larger (normally carries the emoji). */
  title: string;
  /** Short, friendly paragraphs. Empty for title-only celebrations. */
  body: string;
  /** The call-to-action button; omitted for notes that simply time out. */
  button?: string;
  /** Auto-dismiss after this long once readable, if the player doesn't interact. */
  durationMs?: number;
  /** One-time: never shown again once seen (survives reloads). */
  once: boolean;
}

export interface RequirementStory {
  /** Shown the first time the player taps this (currently actionable) requirement. */
  note: StoryNoteDef;
  /** Maze HUD mission line, e.g. "💧 Well Mission". */
  hudTitle: string;
  /** Maze HUD goal line, e.g. "Collect 5 magic drops". */
  hudGoal: string;
  /** The short "all collected!" beat right before the restoration cinematic. */
  celebration: string;
}

export interface AnimalStory {
  intro: StoryNoteDef;
  /** Keyed by FrostedResourceDef.id; the catalog's resource ORDER is the required order. */
  requirements: Record<string, RequirementStory>;
  allRestored: StoryNoteDef;
  final: StoryNoteDef;
}

export const FROSTED_STORY: Record<string, AnimalStory> = {
  fv_rabbit: {
    intro: {
      id: "rabbit_intro_seen",
      kind: "story",
      title: "🐰 Someone needs your help!",
      body: "This little bunny is waiting to come back to the valley...\nbut something in its home is broken.\n\nLet's bring back everything it's missing!",
      button: "Let's go!",
      durationMs: 4000,
      once: true,
    },
    requirements: {
      well: {
        note: {
          id: "rabbit_well_note_seen",
          kind: "objective",
          title: "💧 The well is frozen!",
          body: "The bunny needs its well working again.\n\nLet's find what we need to fix it!",
          button: "Help",
          once: true,
        },
        hudTitle: "💧 Well Mission",
        hudGoal: "Collect 5 magic drops",
        celebration: "✨ All the magic drops collected! ✨",
      },
      carrots: {
        note: {
          id: "rabbit_carrot_note_seen",
          kind: "objective",
          title: "🥕 The garden bed needs help!",
          body: "The bunny's carrots are frozen under the snow.\n\nLet's find them and bring them back!",
          button: "Find the carrots",
          once: true,
        },
        hudTitle: "🥕 Garden Mission",
        hudGoal: "Collect 5 carrots",
        celebration: "🥕 All the carrots collected!",
      },
      chime: {
        note: {
          id: "rabbit_wind_chime_note_seen",
          kind: "objective",
          title: "🎐 The wind chime is broken...",
          body: "Without its chime, the bunny's home feels empty.\n\nLet's find its pieces and bring back its song!",
          button: "Fix the chime",
          once: true,
        },
        hudTitle: "🎐 Chime Mission",
        hudGoal: "Collect 4 chime pieces",
        celebration: "🎐 All the chime pieces collected!",
      },
    },
    allRestored: {
      id: "rabbit_all_requirements_note_seen",
      kind: "story",
      title: "🐰 We did it!",
      body: "The well is working again.\nThe carrot bed is blooming.\nAnd the wind chime is ringing.\n\nNow there's just one thing left...\nbring the bunny back to the valley! ✨",
      button: "Solve the puzzle",
      once: false, // it's the gateway to the puzzle: tapping the silhouette shows it again
    },
    final: {
      id: "rabbit_final_note_seen",
      kind: "celebration",
      title: "🐰 The bunny is back!",
      body: "It's part of the valley again. 💙\n\nTap it to see what it's up to!",
      button: "So cute!",
      once: true,
    },
  },
  fv_fox: {
    intro: {
      id: "fox_intro_seen",
      kind: "story",
      title: "🦊 The fox is waiting for you!",
      body: "The bridge and everything around it was hurt by the cold.\n\nLet's make this place magical again!",
      button: "Let's see what happened",
      durationMs: 4000,
      once: true,
    },
    requirements: {
      ice: {
        note: {
          id: "fox_ice_note_seen",
          kind: "objective",
          title: "🧊 The ice has cracked!",
          body: "The fox's path isn't safe anymore.\n\nLet's gather the magic we need to fix it.",
          button: "Fix the ice",
          once: true,
        },
        hudTitle: "🧊 Ice Mission",
        hudGoal: "Collect 6 ice crystals",
        celebration: "🧊 The ice is safe again!",
      },
      signpost: {
        note: {
          id: "fox_signpost_note_seen",
          kind: "objective",
          title: "🪧 The signpost is lost under the ice!",
          body: "Without the sign, it's hard to find the way.\n\nLet's find its missing pieces.",
          button: "Find the pieces",
          once: true,
        },
        hudTitle: "🪧 Signpost Mission",
        hudGoal: "Collect 4 sign pieces",
        celebration: "🪧 All the sign pieces collected!",
      },
    },
    allRestored: {
      id: "fox_all_requirements_note_seen",
      kind: "story",
      title: "🦊 You did it!",
      body: "The ice is safe again,\nand the signpost is back in place.\n\nNow it's time to find the fox...\nit's waiting for us! ✨",
      button: "Solve the puzzle",
      once: false,
    },
    final: {
      id: "fox_final_note_seen",
      kind: "celebration",
      title: "🦊 The fox is back!",
      body: "Now it can roam around the bridge again. ❄️\n\nMaybe go see what it wants to tell you...",
      button: "Visit the fox",
      once: true,
    },
  },
  fv_deer: {
    intro: {
      id: "deer_intro_seen",
      kind: "story",
      title: "🦌 A quiet friend is waiting",
      body: "Deep in the grove lives a gentle deer...\n\nIt's just waiting for us to bring back some of the grove's lost magic.",
      button: "Let's see what happened",
      durationMs: 4000,
      once: true,
    },
    requirements: {
      flowerbed: {
        note: {
          id: "deer_flowerbed_note_seen",
          kind: "objective",
          title: "🌸 The flower bed fell asleep...",
          body: "The deer misses the flowers that grew here.\n\nLet's help the bed bloom again!",
          button: "Help the flowers",
          once: true,
        },
        hudTitle: "🌸 Flower Mission",
        hudGoal: "Collect 4 winter flowers",
        celebration: "🌸 All the winter flowers collected!",
      },
    },
    allRestored: {
      id: "deer_all_requirements_note_seen",
      kind: "story",
      title: "🦌 The grove is blooming again!",
      body: "The flower bed is blooming,\nand the grove feels a little more magical.\n\nNow there's just one thing left...\nbring the deer home! ✨",
      button: "Solve the puzzle",
      once: false,
    },
    final: {
      id: "deer_final_note_seen",
      kind: "celebration",
      title: "🦌 The deer is back!",
      body: "It's part of the grove again. 💚\n\nTap it to see what it's doing!",
      button: "How lovely!",
      once: true,
    },
  },
  fv_squirrel: {
    intro: {
      id: "squirrel_intro_seen",
      kind: "story",
      title: "🐿️ Someone's scurrying by the waterfall",
      body: "A curious little squirrel is waiting by the frozen waterfall...\n\nLet's help it get its home working again!",
      button: "Let's see what happened",
      durationMs: 4000,
      once: true,
    },
    requirements: {
      nest: {
        note: {
          id: "squirrel_nest_note_seen",
          kind: "objective",
          title: "🌰 The nest is buried under snow!",
          body: "The squirrel has nowhere left to rest.\n\nLet's find what we need to build it a warm, cozy nest!",
          button: "Build a nest",
          once: true,
        },
        hudTitle: "🌰 Nest Mission",
        hudGoal: "Collect 5 berries",
        celebration: "🌰 All the berries collected!",
      },
      pool: {
        note: {
          id: "squirrel_pool_note_seen",
          kind: "objective",
          title: "💧 The rock pool has dried up!",
          body: "Without water, the squirrel's pool is far too quiet.\n\nLet's get the water flowing again!",
          button: "Bring back the water",
          once: true,
        },
        hudTitle: "💧 Pool Mission",
        hudGoal: "Collect 5 snowflakes",
        celebration: "💧 All the snowflakes collected!",
      },
      waterfall: {
        note: {
          id: "squirrel_waterfall_note_seen",
          kind: "objective",
          title: "🧊 The waterfall is frozen solid!",
          body: "The water stopped flowing long ago.\n\nLet's find the magic that will thaw it out!",
          button: "Thaw the waterfall",
          once: true,
        },
        hudTitle: "🧊 Waterfall Mission",
        hudGoal: "Collect 6 magic drops",
        celebration: "🧊 The waterfall is thawing! All drops collected!",
      },
    },
    allRestored: {
      id: "squirrel_all_requirements_note_seen",
      kind: "story",
      title: "🐿️ The waterfall is alive again!",
      body: "The nest is warm, the pool is full,\nand the waterfall flows happily again.\n\nNow there's just one thing left...\nfind the squirrel! ✨",
      button: "Solve the puzzle",
      once: false,
    },
    final: {
      id: "squirrel_final_note_seen",
      kind: "celebration",
      title: "🐿️ The squirrel is back!",
      body: "It's hopping freely by the waterfall again. 🌰\n\nTap it to see what it's up to!",
      button: "So fun!",
      once: true,
    },
  },
  fv_polarbear: {
    intro: {
      id: "polarbear_intro_seen",
      kind: "story",
      title: "🐻‍❄️ A big, kind friend is waiting",
      body: "Among the crystals sits a huge, gentle polar bear...\n\nIt just needs a little help to feel at home again.",
      button: "Let's see what happened",
      durationMs: 4000,
      once: true,
    },
    requirements: {
      crystal: {
        note: {
          id: "polarbear_crystal_note_seen",
          kind: "objective",
          title: "💎 The crystals lost their sparkle!",
          body: "Something put out their magical light.\n\nLet's find what we need to make them glow again!",
          button: "Bring back the sparkle",
          once: true,
        },
        hudTitle: "💎 Crystal Mission",
        hudGoal: "Collect 5 crystal shards",
        celebration: "💎 All the crystal shards collected!",
      },
      hole: {
        note: {
          id: "polarbear_hole_note_seen",
          kind: "objective",
          title: "🕳️ The den under the ice is empty",
          body: "The polar bear needs a safe place to rest.\n\nLet's give it back its snowy home!",
          button: "Build a home",
          once: true,
        },
        hudTitle: "🕳️ Den Mission",
        hudGoal: "Collect 5 icicles",
        celebration: "🕳️ All the icicles collected!",
      },
      cave: {
        note: {
          id: "polarbear_cave_note_seen",
          kind: "objective",
          title: "🕯️ The ice cave is lost in frozen magic",
          body: "Without light, the cave stays dark and cold.\n\nLet's find what will light it up again!",
          button: "Light up the cave",
          once: true,
        },
        hudTitle: "🕯️ Cave Mission",
        hudGoal: "Collect 6 magic lanterns",
        celebration: "🕯️ All the lanterns collected!",
      },
    },
    allRestored: {
      id: "polarbear_all_requirements_note_seen",
      kind: "story",
      title: "🐻‍❄️ The crystals shine again!",
      body: "The crystals sparkle,\nthe den is cozy,\nand the cave is bright.\n\nNow there's just one thing left...\nbring back the polar bear! ✨",
      button: "Solve the puzzle",
      once: false,
    },
    final: {
      id: "polarbear_final_note_seen",
      kind: "celebration",
      title: "🐻‍❄️ The polar bear is back!",
      body: "It's happily guarding the crystals again. ❄️\n\nTap it to say hello!",
      button: "So cute!",
      once: true,
    },
  },
  fv_penguin: {
    intro: {
      id: "penguin_intro_seen",
      kind: "story",
      title: "🐧 A happy friend is waiting on the shore",
      body: "A funny little penguin is sitting on the frozen shore...\n\nIt just needs a little help before it can come home.",
      button: "Let's see what happened",
      durationMs: 4000,
      once: true,
    },
    requirements: {
      igloo: {
        note: {
          id: "penguin_igloo_note_seen",
          kind: "objective",
          title: "🏠 The igloo is buried under snow!",
          body: "The penguin has nowhere to warm up.\n\nLet's find what we need to build it a new igloo!",
          button: "Build an igloo",
          once: true,
        },
        hudTitle: "🏠 Igloo Mission",
        hudGoal: "Collect 5 ice bricks",
        celebration: "🏠 All the ice bricks collected!",
      },
      iceberg: {
        note: {
          id: "penguin_iceberg_note_seen",
          kind: "objective",
          title: "🧊 The big iceberg is gone!",
          body: "Without the iceberg, the shore just isn't the same.\n\nLet's bring it back where it belongs!",
          button: "Bring back the iceberg",
          once: true,
        },
        hudTitle: "🧊 Iceberg Mission",
        hudGoal: "Collect 5 snowflakes",
        celebration: "🧊 The iceberg is back! All snowflakes collected!",
      },
      slide: {
        note: {
          id: "penguin_slide_note_seen",
          kind: "objective",
          title: "🎢 The favorite slide is gone!",
          body: "The penguin really misses its slide.\n\nLet's bring back some fun!",
          button: "Build a slide",
          once: true,
        },
        hudTitle: "🎢 Slide Mission",
        hudGoal: "Collect 6 ice gems",
        celebration: "🎢 All the ice gems collected!",
      },
    },
    allRestored: {
      id: "penguin_all_requirements_note_seen",
      kind: "story",
      title: "🐧 The shore is ready for adventure!",
      body: "The igloo is ready,\nthe iceberg is in place,\nand the slide is waiting.\n\nNow there's just one thing left...\nbring back the penguin! ✨",
      button: "Solve the puzzle",
      once: false,
    },
    final: {
      id: "penguin_final_note_seen",
      kind: "celebration",
      title: "🐧 The penguin is back!",
      body: "It's sliding and playing on the shore again. 🐧\n\nTap it to see what it's doing!",
      button: "So fun!",
      once: true,
    },
  },
};

/** Global, once-ever tutorials (not tied to one animal). */
export const MAZE_HIT_TUTORIAL_ID = "pacman_hit_tutorial_seen";
export const PUZZLE_TUTORIAL_ID = "puzzle_tutorial_seen";

export function mazeHitTutorial(livesLeft: number): StoryNoteDef {
  const lives = livesLeft === 1 ? "You have 1 life left!" : `You have ${livesLeft} lives left.`;
  return {
    id: MAZE_HIT_TUTORIAL_ID,
    kind: "tutorial",
    title: "Oops! ❄️",
    body: `An enemy caught you.\n${lives}\n\nBe careful and keep going!`,
    durationMs: 2600,
    once: true,
  };
}

export const PUZZLE_TUTORIAL: StoryNoteDef = {
  id: PUZZLE_TUTORIAL_ID,
  kind: "tutorial",
  title: "🧩 Put all the pieces together!",
  body: "Drag each piece to its spot.\nWhen it's close enough, it snaps into place.",
  button: "Got it",
  once: true,
};

/**
 * The Winter Market introduction. Shown right after the Rabbit is a real,
 * active animal — the Rabbit is what makes the market's TRY IT OUT useful, so
 * this is the natural moment to say "there's a shop now" and walk the player
 * in. Then, once inside, a short how-it-works tutorial.
 */
export const SHOP_INTRO: StoryNoteDef = {
  id: "shop_intro_seen",
  kind: "story",
  title: "🛍️ The Winter Market is open!",
  body: "Your bunny is home, and the little market in the village has opened its doors.\n\nDress your friends up and decorate the valley with your coins!",
  button: "Take me there",
  once: true,
};

export const SHOP_TUTORIAL: StoryNoteDef = {
  id: "shop_tutorial_seen",
  kind: "tutorial",
  title: "🪙 How the Market works",
  body: "Spend your coins here. Only things you can afford are ready to use.\n\n🏠 Buildings, plants & decorations: press a card and drag it into the valley, then let go to place it.\n\n🐾 TRY IT OUT: tap an accessory to see it on your friend. It's free until you press BUY.",
  button: "Got it",
  once: true,
};

/** Shown when the market is tapped before the first friend is home. */
export const SHOP_LOCKED_HINT = "The market opens once your first friend is home";

/** Caption over the finished puzzle as the living-artwork beat begins. */
export const LIVING_ART_CAPTION = "✨ The picture is coming to life...";

/** Short hint when a not-yet-actionable requirement (or a waiting silhouette) is tapped. */
export const NOT_YET_HINT = "✨ Let's help here first!";

export function storyFor(animalId: string): AnimalStory | undefined {
  return FROSTED_STORY[animalId];
}

export function requirementStory(animalId: string, resourceId: string): RequirementStory | undefined {
  return FROSTED_STORY[animalId]?.requirements[resourceId];
}

/**
 * The single requirement the player may work on right now: the first
 * not-yet-restored resource in catalog order (Well → Carrot Patch → Wind
 * Chime; Cracked Ice → Signpost). Null once every one is restored.
 */
export function nextActionableResource(def: FrostedAnimalDef, isRestored: (resourceId: string) => boolean): string | null {
  return def.resources.find((r) => !isRestored(r.id))?.id ?? null;
}

/** Whether a note should be shown now, given the persisted seen-flags. */
export function shouldShowNote(note: StoryNoteDef, isSeen: (id: string) => boolean): boolean {
  return !note.once || !isSeen(note.id);
}
