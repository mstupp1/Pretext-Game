// ── Literary passages for text streams ──
// Public domain excerpts from classic literature

export const PASSAGES: string[] = [
  // Jane Austen — Pride and Prejudice
  `It is a truth universally acknowledged that a single man in possession of a good fortune must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families that he is considered the rightful property of some one or other of their daughters.`,

  // Charles Dickens — A Tale of Two Cities
  `It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair.`,

  // Edgar Allan Poe — The Raven
  `Once upon a midnight dreary, while I pondered, weak and weary, over many a quaint and curious volume of forgotten lore, while I nodded, nearly napping, suddenly there came a tapping, as of some one gently rapping, rapping at my chamber door.`,

  // Herman Melville — Moby Dick
  `Call me Ishmael. Some years ago, never mind how long precisely, having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation.`,

  // Oscar Wilde — The Picture of Dorian Gray
  `The studio was filled with the rich odour of roses, and when the light summer wind stirred amidst the trees of the garden, there came through the open door the heavy scent of the lilac, or the more delicate perfume of the pink-flowering thorn.`,

  // Charlotte Brontë — Jane Eyre
  `There was no possibility of taking a walk that day. We had been wandering, indeed, in the leafless shrubbery an hour in the morning; but since dinner the cold winter wind had brought with it clouds so sombre, and a rain so penetrating, that further outdoor exercise was now out of the question.`,

  // Mary Shelley — Frankenstein
  `I am by birth a Genevese, and my family is one of the most distinguished of that republic. My ancestors had been for many years counsellors and syndics, and my father had filled several public situations with honour and reputation.`,

  // Lewis Carroll — Alice in Wonderland
  `Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do. Once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, and what is the use of a book without pictures or conversation.`,

  // Fyodor Dostoevsky — Crime and Punishment
  `On an exceptionally hot evening early in July, a young man came out of the garret in which he lodged and walked slowly, as though in hesitation, towards the bridge. He had successfully avoided meeting his landlady on the staircase.`,

  // Virginia Woolf — Mrs Dalloway
  `Mrs Dalloway said she would buy the flowers herself. For Lucy had her work cut out for her. The doors would be taken off their hinges. The men were coming in to lay the felt for the party. And then, thought Clarissa Dalloway, what a morning, fresh as if issued to children on a beach.`,

  // Franz Kafka — The Metamorphosis
  `One morning, when Gregor Samsa woke from troubled dreams, he found himself transformed in his bed into a horrible vermin. He lay on his armour-like back, and if he lifted his head a little he could see his brown belly, slightly domed and divided by arches into stiff sections.`,

  // Mark Twain — Adventures of Huckleberry Finn
  `You do not know about me without you have read a book by the name of The Adventures of Tom Sawyer; but that ain't no matter. That book was made by Mr. Mark Twain, and he told the truth, mainly. There were things which he stretched, but mainly he told the truth.`,
]

export function getPassage(index: number): string {
  return PASSAGES[index % PASSAGES.length]
}

export function getRandomPassage(): string {
  return PASSAGES[Math.floor(Math.random() * PASSAGES.length)]
}
