import { createEmptyCard, fsrs, type Grade } from "ts-fsrs";
import { ReviewSchema, type Flashcard, type Review } from "../shared/model";
import { Store } from "./store";
const scheduler = fsrs({ enable_fuzz: false });
export function reviewCard(
  store: Store,
  itemId: string,
  card: Flashcard,
  cardVersion: string,
  expectedUpdatedAt: string | null,
  grade: Grade,
  now = new Date(),
): Review {
  if (card.version !== cardVersion)
    throw new Error("This card changed. Reopen the deck before reviewing.");
  const key = `${itemId}/${card.id}`;
  const old = store.get<Review>("reviews", key);
  if ((old?.updatedAt ?? null) !== expectedUpdatedAt)
    throw new Error(
      "This review was already saved. Reopen the deck to refresh it.",
    );
  if (old && now.toISOString() <= old.updatedAt)
    now = new Date(Date.parse(old.updatedAt) + 1);
  const memory =
    old?.cardVersion === card.version ? old.memory : createEmptyCard(now);
  const next = scheduler.next(memory, now, grade).card;
  const result = ReviewSchema.parse({
    itemId,
    cardId: card.id,
    cardVersion: card.version,
    updatedAt: now.toISOString(),
    memory: {
      ...next,
      due: next.due.toISOString(),
      last_review: next.last_review?.toISOString(),
    },
  });
  store.put("reviews", key, result);
  return result;
}
