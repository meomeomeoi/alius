# P3b manual test (in SillyTavern)

Run on a campaign with at least four named soldiers and a mechanic profile. Reset nothing between steps unless it says so. "MEMORY view" is the MEMORY block in a soldier's dossier (SQUAD tab); the world's is under SYS › MEMORY.

## 1. A failed run, and the rumor two days later
1. Send a squad of two out on a run and let it fail (retreat or lose). Back at the base open the dossier of a soldier who went: the MEMORY view lists "The run to … failed." with the chip **SEEN**.
2. Start a private scene with a soldier who stayed behind and look at the context block (SYS › Debug › LLM log, newest call): the run is **not** in it (she has not heard).
3. Pass two days (end the day twice). The chip of that fact in the dossier of the soldier who went now reads **HEARD** (somebody heard it), and a new private scene with the soldier who stayed carries the line `(heard as a rumor) The run to … failed.`

## 2. A vote is remembered after the grudge ends
1. Turn voting on (world option), overrule a squad vote (carry the decision out against the squad).
2. Every soldier's MEMORY view lists "The commander overruled the squad's vote; … voted against."
3. Pass three days, so the grudge directive is gone, and open a scene with one of the dissenters: the fact line is still in the context block.

## 3. The fold, with and without a profile
1. Set the preset to **short** (SYS › MEMORY). Play or edit the save until a soldier has six facts older than four days (or use SYS › Debug to age them).
2. After the next action her dossier shows text in its private and shared parts, the folded facts are gone from the list, and `folded` rises in the dossier reading (hover the DOSSIER label with the analysis tool).
3. Set the mechanic profile to none and fallback to main **off**; make another fold due: the dossier text is the facts joined and cut (oldest dropped first), with no error and no call in the LLM log.

## 4. A group scene leaks nothing private
1. Give one soldier a private fact (a private scene with her where a secret is said) and let a fold put something in her private dossier part.
2. Start a group scene with her and a second soldier. In the LLM log the context block of that scene shows her shared dossier part, but **not** the private part, not the private fact, no journal evidence (`: '…'`) and no "Messages lately".
3. In a private scene with her alone all of those appear.

## 5. Hiding old scenes: on, then off
1. Finish three scenes (each with a summary). Set **Hide scenes older than the last N** to 1.
2. After the next action the messages of the two oldest scenes are hidden in the ST chat (the eye icon / the ghost look). Messages of the open scene and of the newest ended one are not.
3. Add a system message (a narrator line, or a deserter notice) inside an old scene's range before step 2 if you can; after step 2 it is hidden as it was.
4. Set the number back to 0: exactly the messages Alius hid show again; the narrator line stays hidden.
5. Reload the chat with hiding on: nothing is hidden twice and nothing is unhidden.

## 6. An edited older message does not redo the digest
1. In one long scene (over about 2500 tokens before the last four messages) wait until a digest is written (SYS › Debug › LLM log shows a `scene_summary` call in digest mode).
2. Edit an old message of that scene. No new digest call follows, and ending the scene still summarizes the digest plus the tail.

## 7. The settings and the view
1. SYS › MEMORY: the preset buttons change the numbers; the numbers are greyed (aria-disabled) while the edit lock is on and editable with it off (editing one switches the preset to custom).
2. Choose **long**: the warning "more than half of the context cap" appears (cap 1600); raising the cap to 2400 removes it.
3. The fill shows facts / limit, dossiers, chronicle entries, the memory and directive tokens of the last prompt and the save size.
4. MEMORY view: PIN keeps a fact through a fold; FORGET asks first; EDIT (edit lock off) rewrites a fact and marks it edited; EDIT DOSSIER rewrites a dossier.
5. Rumor mode **retold**: a spreading fact is retold once (one `rumor_retell` call) in the teller's voice, with no digits; with the mechanic off the plain text is used.
