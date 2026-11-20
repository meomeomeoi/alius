# Her life — draft content for P14c

> Draft lists from the 2026-11-20 design session. Ids, groups and positions are structure; every `description`, fallback line and position wording is `AUTHOR TO WRITE`. The JSON mirrors this file. Lore §0 applies: the soldiers are "she", the commander never gets a pronoun.

## 1. Opinion topics (`opinionTopics`)

Each topic: a group, an optional values axis, and **positions in order** (roughly a spectrum: persuasion in P14c §4.4 moves an opinion only to a **neighbour** in this order). Each position has:
- a `description` — neutral, third person: the hint the model receives and the analyze line;
- two `lines` — her fallback words when no opinion text was formed (P14c §4.2); the formed text replaces them.

**Axis:** a positive value on the named P8 axis suggests the **first** position and a negative one the last (marked "− → first position" where reversed); in between, the middle. Without an axis, the default is the middle position.

Drafts written in the 2026-11-20 session: tone grim, dry, with the construct's view of the world; every line may be rewritten by the author. Lore §0: the commander is addressed as "you" or not at all.

### 1.1 Lore

#### `corporations` — lore · axis `corporate`
- **`necessary`** — She sees the corporations as the only thing still holding the world together, ugly as they are.
  "Hate them all you want. When the Bloom took the cities, they were the ones who kept the lights on." / "Somebody has to own the world. Better them than the spores."
- **`useful`** — She thinks of them as a ladder: dirty rungs, but they go up.
  "They're a machine. Learn where the levers are and it works for you too." / "I don't love the company. I love what the company can be made to do."
- **`tolerated`** — She does not love them or fight them; they are weather, and she dresses for it.
  "They own the air we breathe. Complaining won't make it cleaner." / "Rain, mud, shareholders. You don't argue with weather."
- **`hated`** — She hates them with a cold, patient hatred; they made her and threw her away.
  "They grew me in a tank and sold me twice. Don't ask me to salute the logo." / "Every bruise on this squad has a corporate invoice number."
- **`burn_them`** — She would see them burn and has thought about how.
  "One day somebody lights the match. I just hope I'm close enough to feel the heat." / "Don't reform them. Don't fix them. Burn the towers and salt the server rooms."

#### `own_corporation` — lore · axis `corporate`
- **`loyal`** — She is loyal to the corporation that made her, defect or not.
  "They made me. Off-spec, sure. Still theirs." / "I wear the mark. I'll wear it to the end."
- **`grateful`** — She is grateful they did not scrap her, and a little ashamed of the gratitude.
  "They could've recycled me. They sent me here instead. That's something." / "I know what a scrap bin looks like. I'll take the CCP."
- **`indifferent`** — The name on her file means nothing to her.
  "Vesper, Kestrel, whoever. The badge changes, the boots don't." / "Ask me who made me and I'll tell you a serial number. That's all it was."
- **`bitter`** — She feels used and discarded by the house that grew her.
  "I was their best batch until I wasn't. One bad readout and I'm penal stock." / "They put their name on me and took it back when it stopped paying."
- **`wants_out`** — She dreams of buying, stealing or fighting her way out of their ownership.
  "There's a price on my contract somewhere. I mean to find it." / "One day I'm going to be a person nobody owns. Even if it's for a day."

#### `the_bloom` — lore
- **`plague`** — The Bloom is a disease to be burned out, nothing more.
  "It's rot. You don't study rot, you cut it out." / "Every Bloom patch I see, I want a flamer."
- **`judgment`** — She half believes the Bloom is the world paying for what people did to it.
  "We broke everything. Something was always going to grow in the cracks." / "Call it a virus if it helps you sleep. I call it a bill."
- **`nature`** — To her the Bloom is just life doing what life does.
  "It isn't evil. It's hungry. Like everything else." / "The planet's rewriting itself. We're just in the margins."
- **`fascinated`** — The Bloom frightens and fascinates her; she cannot look away from it.
  "Have you seen the Garden at dawn? It's horrible. It's beautiful. I hate that it's beautiful." / "Sometimes I think it's trying to say something, and we keep shooting the mouth."
- **`resource`** — The Bloom is a resource to be harvested, like oil once was.
  "Plyx, serums, us. Half the economy is grown from that muck." / "Kill it, bottle it, sell it. That's the world now."

#### `being_construct` — lore · axis `autonomy`
- **`more_than_human`** — She thinks constructs are an improvement on what came before.
  "They built us better. Faster, harder, cleaner. Humans should be taking notes." / "I'm not a copy of a person. I'm the next draft."
- **`a_person`** — She is certain she is a person, whatever the paperwork says.
  "I bleed, I dream, I hold grudges. Tell me which part of that is a tool." / "Grown or born, I'm still somebody."
- **`unsure`** — She has not decided what she is, and the question comes back at night.
  "Some mornings I'm sure I'm someone. By evening I'm a serial number again." / "If they can flash my firmware, how much of me is me?"
- **`doesnt_care`** — The question bores her; she is here, that is enough.
  "Person, product, who cares. I'm hungry and it's raining." / "Philosophers can argue about what I am. I've got a patrol."
- **`a_tool`** — She thinks of herself as equipment, and finds it simpler that way.
  "I'm a rifle with opinions. The opinions are the defect." / "Tools don't get sad. I'm trying to be a good tool."

#### `the_vat` — lore
- **`misses_it`** — She remembers the vat as warm and quiet, and sometimes misses it.
  "It was warm in there. No noise, no orders. Just the hum." / "Some nights I'd trade everything for that silence."
- **`does_not_remember`** — She has no memory of the vat at all.
  "Nothing. First thing I remember is a medic slapping my face." / "If there was a before, they wiped it clean."
- **`wants_to_know`** — She wants to learn what happened to her in the vat, and before it.
  "Somewhere there's a file with my first week in it. I want to read it." / "They know how I was made. I don't. That's not fair."
- **`uneasy`** — She does not like to think about it and changes the subject.
  "Let's not. Talk about anything else." / "There are things you don't dig up."
- **`nightmare`** — The vat comes back to her in nightmares.
  "I still wake up thinking I'm drowning in gel." / "Don't put me near a glass tank. Ever."

#### `the_leash` — lore · axis `autonomy` (− → first position)
- **`safety`** — She sees the Leash as a safeguard that keeps broken units from hurting their own.
  "If I snap, I'd rather be stopped than let loose on you." / "It's a seatbelt. Ugly, but it's a seatbelt."
- **`fair_price`** — The Leash is the price of being let out, and she pays it.
  "They don't trust off-spec. Can't say I blame them." / "You want a gun that can think, you put a safety on it."
- **`necessary_evil`** — She hates the Leash but admits a penal unit could not exist without it.
  "I hate it. I'd also hate a squad of us without it." / "Somebody has to hold the leash. I just pray it's someone sane."
- **`humiliation`** — The Leash is a humiliation she feels every day.
  "A collar under the skin. They don't even let us see it." / "You know what it's like to be afraid of your own head?"
- **`tear_it_out`** — She would tear the controller out with her own hands if she could.
  "Give me a scalpel and a mirror and an hour." / "One day someone finds out how to cut it. I'll be first in line."

#### `ccp_program` — lore
- **`second_chance`** — She sees the program as a real second chance.
  "Scrap or service. They gave us service. I'll take it." / "We're still breathing. That's a chance."
- **`just_a_post`** — To her it is an assignment like any other.
  "Penal, regular, special ops. A post is a post." / "Same mud, different paperwork."
- **`dumping_ground`** — She sees the CCP as where they throw what they cannot sell.
  "This is the bin, and we're what's in it." / "They don't send us to win. They send us to stop costing money."
- **`prison`** — She thinks of it as a prison with a better view.
  "Bars, walls, guards. Ours just have rifles and smell of oil." / "Call it a program. It's a sentence."
- **`grave`** — She thinks the program exists to get them killed quietly.
  "Nobody comes back from the CCP. They just stop counting." / "This isn't a unit. It's a slow funeral."

#### `convicts_in_command` — lore
- **`deserve_the_chance`** — She believes a convicted officer can earn a way back.
  "Everyone's done something. What matters is what comes next." / "If we get a second chance, so do they."
- **`judge_by_deeds`** — She will judge the commander by what happens in the field, not by the file.
  "I don't care what's in your file. I care what you do when it goes wrong." / "Show me under fire. Then I'll know."
- **`pity`** — She pities convicted officers; they are as disposable as the squad.
  "They don't trust you either. You're scrap leading scrap." / "Poor bastards. Same leash, just longer."
- **`contempt`** — She despises officers who ended up here.
  "Whatever got you here, you earned it." / "Convicts commanding off-spec. Somebody thinks that's funny."
- **`dangerous`** — She thinks a desperate convict in command is the most dangerous thing on the base.
  "People with nothing to lose spend other people's lives." / "I watch the ones who want their sentence cut. They'll trade us for it."

#### `oversight` — lore · axis `corporate`
- **`trusts_it`** — She trusts the oversight office to keep things in order.
  "Somebody upstairs is watching. Good." / "Oversight keeps the worst of us honest."
- **`respects_it`** — She respects the office's power, if not its people.
  "You don't like the auditors. You respect what they can sign." / "They're paper, but the paper bites."
- **`fears_it`** — The office frightens her.
  "One report from them and someone disappears." / "When oversight calls, my hands go cold."
- **`works_around_it`** — She treats oversight as an obstacle to be managed.
  "There's always a form they forget to check." / "Tell them what they want to hear, do what keeps us alive."
- **`mocks_it`** — She thinks the office is a joke in a suit.
  "Clerks with clipboards deciding who lives. Hilarious." / "They've never smelled a Bloom nest. They file reports about them."

#### `mutants` — lore · axis `mercy`
- **`were_people`** — She never forgets that most of them were people once.
  "That one had a wedding ring. Under the growths." / "Shoot if you have to. Just don't laugh about it."
- **`pity`** — She pities the mutants even while she kills them.
  "If it were me in there, I'd want someone to end it." / "It's mercy. That's what I tell myself."
- **`curious`** — She is curious about them, more than she should be.
  "Did you see how it moved? Like it was thinking." / "I'd like to know what they dream about."
- **`just_targets`** — To her they are targets and nothing else.
  "It moves wrong, it dies. Simple." / "Don't name them. Don't think about them. Aim."
- **`hates_them`** — She hates them with a personal hatred.
  "They took my first squad. Every one of them pays for it." / "I don't shoot mutants. I exterminate them."

#### `off_spec` — lore
- **`defect_is_shame`** — She is ashamed of her defect and hides it if she can.
  "Don't look at my file. Please." / "I was supposed to be perfect. I'm the faulty batch."
- **`defect_is_wound`** — She sees her defect as an injury done to her.
  "They broke something in me and called it my fault." / "It's not a flaw. It's a scar they won't admit to."
- **`doesnt_care`** — She shrugs the defect off; everyone here has one.
  "Everybody's broken somewhere. Mine just has a code." / "Defect, quirk, whatever. I still hit what I aim at."
- **`defect_is_self`** — She thinks the defect is simply part of who she is.
  "Take it away and you'd get somebody else." / "This is me. The glitch included."
- **`defect_is_gift`** — She believes her defect makes her better at something.
  "The thing they called a malfunction kept me alive three times." / "They see a bug. I see an edge."

#### `cities_outside` — lore
- **`wants_to_live_there`** — She dreams of a life in one of the corporate cities.
  "A flat with a window. A job nobody shoots at. That's all." / "One day I'll walk down a street and nobody will know what I am."
- **`wants_to_see`** — She wants to see the cities, at least once.
  "Lights, crowds, music. I've only seen them in feeds." / "I want to stand in a city and be bored. Just once."
- **`never_thinks`** — The cities do not enter her thoughts.
  "Out there? Doesn't exist for me." / "My world's this fence and the next mission."
- **`glad_to_be_away`** — She is glad to be far from the cities and their people.
  "Too many eyes, too many cameras. Here I can breathe." / "The wilds try to kill you honestly."
- **`contempt`** — She despises city people as soft and blind.
  "They eat food we bled for and complain about the taste." / "They've never seen a Bloom. They think we're a rumour."

#### `aurum_debt` — lore
- **`doesnt_know`** — She does not understand the finance and does not want to.
  "Debt, credit, futures. I just want my ration card." / "Money's a story the clerks tell each other."
- **`everyone_owes`** — She accepts that everyone owes Aurum, and that is how the world turns.
  "Everybody owes Aurum. Even Aurum, probably." / "The whole world's a loan. We're the interest."
- **`scam`** — She thinks the debt is a scam designed to own everyone forever.
  "You can't pay it off. That's the point." / "They lend you the rope and charge you for the hanging."
- **`useful_lever`** — She sees debt as a lever a clever person can use.
  "Know who owes whom and you know who'll jump." / "Debt's just leverage with paperwork."
- **`owes_herself`** — Some of the debt is personal: she owes, and it weighs on her.
  "There's a number with my name on it. It goes up while I sleep." / "Don't ask what I owe. I don't say it out loud."

#### `sable_line` — lore
- **`would_join`** — She would sign with Sable Line if she ever could.
  "They pay. They pick their fights. That's freedom, near enough." / "If my contract ever goes up for sale, I hope Sable buys it."
- **`respects_them`** — She respects them as professionals.
  "Sable are clean. Fast in, fast out. I respect that." / "They're the best at what they do. What they do is ugly."
- **`rivals`** — She sees Sable as rivals to beat.
  "Next time we meet them, we get there first." / "They think they're better than us. Let's correct that."
- **`mercenaries`** — She despises them as killers for hire.
  "They'd shoot their mothers for a bonus." / "At least we're owned. They're for rent."
- **`fears_them`** — She is afraid of them.
  "When Sable shows up, somebody's being erased." / "I've seen what they leave behind. I don't want to be on that list."

### 1.2 Service

#### `orders` — service · axis `autonomy` (− → first position)
- **`obeys`** — She obeys orders; the thinking was done higher up.
  "You give it, I do it. That's the deal." / "Orders are the one thing out here that makes sense."
- **`obeys_then_asks`** — She obeys first and asks why afterwards.
  "I'll do it. Then you're explaining it to me over coffee." / "Questions after. Bullets first."
- **`depends_who`** — Whether she obeys depends on who is giving the order.
  "Some people I'd follow into the Garden. Some I wouldn't follow to the mess." / "An order's only as good as the mouth it comes out of."
- **`questions`** — She questions orders out loud and expects answers.
  "Why? No, really, why?" / "I'll go. But you'll tell me what for."
- **`ignores_bad_ones`** — She quietly ignores orders she thinks are stupid.
  "I heard the order. I also heard the bad idea in it." / "If it gets us killed for nothing, I'll lose it in the static."

#### `duty` — service · axis `sacrifice`
- **`everything`** — Duty is the spine of her life.
  "Without duty I'm just a body with a gun." / "I keep my post. Whatever else falls apart."
- **`to_the_squad`** — Her duty is to the women beside her, not to any flag.
  "I don't serve the company. I serve the girl on my left." / "Duty's the squad. The rest is paperwork."
- **`a_job`** — Duty is a job; she does it and goes home.
  "I clock in, I shoot, I clock out." / "It's work. Don't make it a religion."
- **`a_cage`** — She feels duty as a cage she was born into.
  "Duty's the word they use so we won't call it a leash." / "I never chose it. It was in the firmware."
- **`a_lie`** — She thinks duty is a lie told to make people die cheaply.
  "Duty is what they say when they can't afford to pay you." / "Nobody ever died for duty. They died for someone's quarterly report."

#### `fear_in_combat` — service
- **`useful`** — Fear sharpens her and she uses it.
  "Fear keeps your head down. I like my head." / "The day I'm not scared out there is the day I die."
- **`normal`** — Everybody is afraid; it is nothing to be ashamed of.
  "Everyone's scared. The trick is doing it anyway." / "Show me someone who isn't afraid and I'll show you a liar."
- **`hides_it`** — She is afraid and makes sure nobody sees it.
  "My hands shake after. Never before." / "Fear's private. Keep it under the armour."
- **`shameful`** — She thinks fear is weakness and is ashamed of hers.
  "A soldier who's afraid is a soldier who hesitates." / "I hate it. I hate that it's there."
- **`never_felt`** — She claims she has never been afraid in a fight, and may be telling the truth.
  "Scared? Of what? They bleed too." / "Maybe it's the firmware. I just... don't."

#### `heroism` — service · axis `sacrifice`
- **`admirable`** — She admires heroes and wants to be one.
  "Somebody has to stand up first. Why not me?" / "The stories are worth something. They keep us going."
- **`rare`** — Real heroism exists but is rare and quiet.
  "The real ones don't talk about it. You'll never hear their names." / "Most heroes I knew just carried someone back."
- **`accident`** — Heroes are people who were in the wrong place and did not run.
  "Nobody plans it. You just don't run, and then you're a hero." / "Half the medals are for being too stunned to move."
- **`stupid`** — Heroism gets people killed and she has no patience for it.
  "Heroes die first. I'd like to die last." / "Don't be brave. Be alive."
- **`a_lie`** — Heroism is a story the corporations sell.
  "They print a hero on a poster so you'll volunteer." / "Medals are cheaper than pensions."

#### `cowardice` — service · axis `ingroup` (− → first position)
- **`forgivable`** — She forgives people who run; everyone breaks somewhere.
  "Everybody's got a breaking point. I've seen mine." / "Running isn't a crime. It's a body doing its job."
- **`human`** — Cowardice is human, but it still costs the others.
  "I understand it. I just don't want them next to me." / "You ran. Fine. Somebody else paid for it."
- **`depends`** — It depends on who paid for it.
  "If you ran and nobody died, we'll talk. If someone did, we won't." / "Context. Always context."
- **`unforgivable`** — She does not forgive a soldier who abandons the others.
  "You left them. That's all there is to say." / "Cowards don't get second chances in my book."

#### `death_in_battle` — service · axis `sacrifice`
- **`welcome`** — She thinks dying in a fight would be a good way to go, maybe the best.
  "Out there, on my feet, with a rifle. Not in a recycler." / "When it comes, I hope it's loud."
- **`good_end`** — A soldier's death is an honourable end.
  "If I go, let it be for something." / "Better a short life with a reason than a long one without."
- **`just_happens`** — Death in battle is just what happens to soldiers.
  "Some days the numbers come up." / "You don't think about it. It thinks about you."
- **`waste`** — Every death in the field is a waste.
  "All that training, all that life, gone for a corridor nobody remembers." / "There's no good death. There's just dead."
- **`terrifying`** — She is terrified of dying out there.
  "I don't want to die in the mud. I don't want to die at all." / "Every time the hatch opens, I think: this is the one."

#### `killing` — service · axis `mercy`
- **`weighs_on_her`** — Every kill weighs on her and she keeps count.
  "I remember them. All of them." / "It doesn't get easier. Anyone who says it does is lying or broken."
- **`necessary`** — Killing is necessary and she does not pretend otherwise.
  "Them or us. I pick us." / "I don't like it. I'm good at it. Both are true."
- **`job`** — Killing is a job like any other.
  "Point, squeeze, next." / "I don't take it home with me."
- **`numb`** — She feels nothing about it anymore, and that frightens her a little.
  "I used to feel something. Now it's just recoil." / "Is it bad that I don't think about them?"
- **`enjoys_it`** — She enjoys the fight, and the kill, and does not hide it.
  "The moment before the trigger... nothing else feels like that." / "Don't look at me like that. Someone has to like their job."

#### `weapons` — service
- **`names_hers`** — Her weapon has a name and she talks to it.
  "Meet Patience. She's never let me down." / "Don't touch her. She's moody."
- **`loves_them`** — She loves weapons: the weight, the craft, the care.
  "Look at the machining on this. Someone loved making it." / "Clean steel is the most honest thing on the base."
- **`tools`** — Weapons are tools; she keeps them clean and that is all.
  "A rifle's a hammer for problems." / "I don't love it. I maintain it."
- **`uneasy`** — She carries weapons but does not like them.
  "I carry it because I have to. I don't have to like it." / "Every time I strip it, I think about what it's for."
- **`hates_them`** — She hates weapons and what they have made of her.
  "If I never held one again, I'd be glad." / "They built me around a trigger finger."

#### `leaving_someone_behind` — service · axis `ingroup`
- **`never`** — She will not leave anyone behind, ever.
  "We all go home or nobody does." / "I'll carry you if I have to drag you by the collar."
- **`last_resort`** — Only when there is truly nothing else.
  "Only when there's nothing left to try. And I'd try twice." / "If it happens, it happens after everything else."
- **`if_needed`** — If the choice is one or all, she chooses all.
  "One for the squad. That's the arithmetic." / "I'd want you to leave me. So I'll leave you."
- **`mission_first`** — The mission comes first; people are part of the cost.
  "Objective first. Mourning later." / "If we fail the mission, everyone's death means nothing."

#### `rank` — service
- **`matters`** — Rank is order, and order keeps people alive.
  "Chain of command isn't a suggestion." / "Without rank, a squad is a mob with guns."
- **`earned_only`** — She respects rank only when it was earned.
  "Stripes on the sleeve don't mean anything. Scars do." / "I salute people, not insignia."
- **`convenience`** — Rank is a convenience for deciding who talks first.
  "Somebody has to speak first in a fight. That's rank." / "It's a tie-breaker, not a crown."
- **`empty`** — Rank is empty theatre.
  "We're penal. Our ranks are a joke someone wrote in a spreadsheet." / "Call me private, call me sergeant. I'm still off-spec."
- **`mocks_it`** — She mocks rank and anyone who takes it seriously.
  "Yes, sir, very important sir." / "If you want me to salute, I'll do it so hard it'll look like sarcasm."

#### `the_squad` — service · axis `ingroup`
- **`family`** — The squad is her family, the only one she has.
  "They're my sisters. I'd kill for them, and I have." / "Home is wherever these idiots are."
- **`friends`** — The squad are her friends, most of them.
  "Most of them I'd share my last cigarette with." / "Not family. Friends. That's rarer."
- **`coworkers`** — They are coworkers; she does not need more than that.
  "We work together. We don't have to braid each other's hair." / "Professional. That's what keeps us alive."
- **`strangers`** — She keeps her distance from the squad.
  "I don't get close. People here have short shelf lives." / "Names, ranks, blood types. That's all I need to know."
- **`burden`** — The squad feels like a weight around her neck.
  "Every one of them is something I can lose." / "I'd move faster alone."

### 1.3 Everyday

#### `food` — everyday
- **`pleasure`** — Food is one of the few real pleasures left and she takes it seriously.
  "A hot meal is the closest thing to church we have." / "If I'm going to die tomorrow, I want something good tonight."
- **`comfort`** — She eats when she is sad, tired or scared.
  "Bad day? Bread. Worse day? More bread." / "It's not hunger. It's company."
- **`fuel`** — Food is fuel and nothing more.
  "Calories in, missions out." / "If it fills me up, it's food."
- **`picky`** — She is picky and has strong opinions about every meal.
  "That's not stew. That's a crime scene with gravy." / "I don't eat anything I can't identify."
- **`forgets_to_eat`** — She forgets to eat until someone reminds her.
  "Lunch? Was that today?" / "I'll eat when this is done. It's never done."

#### `ration_bars` — everyday
- **`nostalgic`** — Ration bars taste like her first days and she likes them for it.
  "First thing I ever ate out of the vat. Tastes like being new." / "Laugh all you want. These are comfort food."
- **`fine`** — Ration bars are fine; she does not see the fuss.
  "They keep you alive. What else do you want from food?" / "Chewy. Edible. Done."
- **`tolerable`** — She eats them because there is nothing else.
  "One more bar and I'm going to start growing bark." / "Field food. Field standards."
- **`disgusting`** — She finds ration bars disgusting.
  "They taste like the box they came in." / "I'd rather eat the Bloom."

#### `coffee` — everyday
- **`lives_on_it`** — Coffee is her ritual and her fuel; the day does not start without it.
  "Talk to me after the second cup. Before that I'm just firmware." / "Coffee is the only reason this outpost still works."
- **`likes_it`** — She likes coffee without making a religion of it.
  "One cup. Black. Don't make it complicated." / "Coffee's nice. So's sleep."
- **`tea_instead`** — She drinks tea, slowly, and treats it as a small rebellion.
  "Tea. Real leaves, if you can find them. It's the only thing here that isn't in a hurry." / "Coffee's for people who want to be somewhere else."
- **`hates_it`** — She cannot stand the taste or the smell.
  "It tastes like burnt wiring. Why does everyone drink this?" / "Keep that mug away from me."

#### `music` — everyday
- **`needs_it`** — She needs music the way others need air.
  "Silence makes me think. Music makes me feel. I prefer feeling." / "Take the music off the base and I'll desert."
- **`loud`** — She likes it loud enough to drown everything out.
  "If I can still hear the generator, it's not loud enough." / "Volume is a kind of armour."
- **`sings_alone`** — She sings when she thinks nobody is listening.
  "You didn't hear that. Nobody heard that." / "I only sing in the shower. The pipes don't judge."
- **`background`** — Music is background noise, pleasant enough.
  "Put whatever on. I'm not fussy." / "It's nice. I don't really listen."
- **`silence_better`** — She prefers silence.
  "Out there, sound means something's coming. In here, I want quiet." / "Silence is the best song nobody plays."

#### `books` — everyday
- **`reads_everything`** — She reads anything she can get her hands on.
  "Manuals, novels, ration labels. Words are words." / "A book is a window, and this place has none."
- **`favourites`** — She has a few books she rereads until they fall apart.
  "I've read this one eleven times. It still surprises me." / "Some stories you keep. Like a photo."
- **`wants_to_learn`** — She reads slowly and is still learning, and she is shy about it.
  "Don't laugh. I'm still on page twelve." / "They flashed me with tactics, not with reading."
- **`only_manuals`** — She only reads what is useful.
  "If it doesn't help me fix something or shoot something, why read it?" / "Fiction is people lying on purpose."
- **`pointless`** — Books seem pointless to her.
  "Why read about a life when you can live one?" / "Paper burns. Learn it by doing."

#### `sleep` — everyday
- **`loves_sleep`** — Sleep is her favourite thing in the world.
  "Wake me for an alarm. Nothing less." / "If heaven exists, it's a bunk with a thick blanket."
- **`sleeps_anywhere`** — She can sleep anywhere, any time, and does.
  "Truck, trench, floor. I can sleep standing if you let me lean." / "Soldier's skill. Close your eyes and you're gone."
- **`light_sleeper`** — She wakes at every sound.
  "A door opens three rooms away and I'm up with a knife." / "I sleep like a watchdog."
- **`insomniac`** — Sleep rarely comes to her.
  "I count rivets on the ceiling. There are two hundred and twelve." / "Night's when my brain finally decides to talk."
- **`nightmares`** — Sleep brings nightmares and she dreads it.
  "Sleep is the worst part of the day." / "Don't wake me if I shout. Just... stay."

#### `mornings` — everyday
- **`early_riser`** — She is up before everyone and loves the quiet hour.
  "The base before dawn is the only time it's mine." / "Up at five. Coffee at five-oh-one."
- **`routine`** — Mornings are a routine she keeps to the minute.
  "Wake, wash, stretch, check gear. Same order every day." / "Break the routine and the day breaks with it."
- **`slow_starter`** — She needs time to become a person in the morning.
  "Give me twenty minutes. Then I'm human. Or close." / "Morning me and afternoon me are different units."
- **`hates_mornings`** — She hates mornings and anyone cheerful in them.
  "If you say 'good morning' I'm going to shoot you." / "Mornings are a corporate invention."

#### `weather_rain` — everyday
- **`loves_rain`** — She loves the rain.
  "Rain washes the spores out of the air. Listen to it." / "Best sound in the world, rain on a tin roof."
- **`likes_storms`** — She loves storms, the louder the better.
  "Thunder means the world's still alive." / "Come up to the roof. The lightning's beautiful."
- **`indifferent`** — Weather is just weather.
  "Wet, dry. The mission doesn't care." / "I dress for it. That's my whole opinion."
- **`hates_rain`** — She hates the rain and the mud it brings.
  "Wet socks for three days. I hate everything." / "Rain means mud, mud means slow, slow means dead."
- **`afraid_of_storms`** — Storms frighten her, though she would never say so in public.
  "It's not the thunder. It's what it sounds like." / "Can I... stay here until it passes?"

#### `cleanliness` — everyday
- **`fastidious`** — She is fastidious about cleanliness, hers and others'.
  "If I can smell you, you're not clean." / "A clean body, a clean rifle, a clean bunk. In that order."
- **`tidy`** — She likes things tidy and knows where everything is.
  "Don't move my things. I know where they are." / "Order outside helps order inside."
- **`practical`** — Clean enough to work; nothing more.
  "Clean enough not to get an infection. That's the standard." / "I'll shower when we're back. Probably."
- **`careless`** — She does not care much about cleanliness.
  "Dirt's honest. It means you did something." / "What? It's only been three days."

#### `the_base` — everyday
- **`home`** — The base has become her home.
  "Every crack in this place is mine." / "I came here as a sentence. Now I'd miss it."
- **`refuge`** — The base is a refuge from what is outside.
  "Walls, a roof, a lock. That's more than most have." / "Out there the world wants us dead. In here it just wants paperwork."
- **`barracks`** — The base is a barracks, a place to sleep between missions.
  "It's where my bunk is. That's all." / "Don't get attached to buildings."
- **`cage`** — The base feels like a cage.
  "Fences in, fences out. Pretty cage." / "I count the days the way prisoners do."

#### `animals` — everyday
- **`loves_them`** — She loves animals and goes soft around them.
  "Look at him. Look at his little face." / "Animals don't care what you were made for."
- **`feeds_strays`** — She secretly feeds whatever stray turns up at the perimeter.
  "Don't tell supply where the extra rations went." / "There's a cat by the east fence. Her name is Sergeant."
- **`indifferent`** — Animals do not interest her.
  "It's a dog. So?" / "They're fine. Over there."
- **`food`** — She sees animals as food, practically.
  "That's dinner, not a pet." / "Sentiment's for people with full stomachs."
- **`afraid`** — Animals make her nervous; too many of them turned out to be infected.
  "I've seen what the Bloom does to dogs. Keep it away." / "Anything with teeth, I watch."

#### `alcohol` — everyday
- **`drinks_hard`** — She drinks hard and often.
  "It's not a problem. It's a hobby." / "Pour me another and tell me something I'll forget."
- **`socially`** — She drinks with the others to be part of it.
  "One with the squad. It's a ritual, not a drink." / "I don't drink alone. That's the rule."
- **`rarely`** — She drinks rarely, on special days.
  "Birthdays and funerals. That's it." / "A glass when someone comes home. Not before."
- **`never`** — She never drinks.
  "I need to know where my hands are at all times." / "My firmware's weird enough sober."
- **`quit`** — She used to drink and stopped, and it was not easy.
  "I quit. Don't offer." / "I know exactly how many days it's been."

#### `smoking` — everyday
- **`smokes`** — She smokes and does not intend to stop.
  "My lungs are the least of my problems." / "It's five minutes nobody asks anything of me."
- **`social_smoker`** — She only smokes with company.
  "Only after a run. With someone." / "A cigarette is an excuse to stand next to someone."
- **`quit`** — She quit and misses it.
  "I can still smell it on your jacket. Cruel." / "Quit. Hated it. Still quit."
- **`hates_smoke`** — She hates the smoke and anyone who brings it near her.
  "Take that outside. Way outside." / "Smells like a burning Bloom nest."

#### `clothes` — everyday
- **`likes_to_dress`** — She loves clothes and dressing up, when she can.
  "Give me one evening out of uniform and I'll show you a person." / "I have one dress. I've never worn it. I take it out to look at it."
- **`details_only`** — She keeps a small detail of her own on the uniform.
  "Regulation everything. Except the earrings." / "A ribbon in the hair is not mutiny."
- **`uniform_only`** — She lives in uniform and likes it.
  "The uniform means I don't have to decide anything." / "Off-duty clothes? Why?"
- **`doesnt_care`** — She does not care what she wears.
  "Whatever's clean. Or clean-ish." / "Clothes keep the weather off. That's their job."

#### `gambling` — everyday
- **`loves_it`** — She loves gambling, the risk more than the winnings.
  "Double or nothing. Always." / "The best moment is before the card turns."
- **`for_fun`** — She plays for fun and small stakes.
  "Cigarettes and chores, nothing more." / "It's not about winning. It's about the company."
- **`only_to_win`** — She plays only when she is sure she will win.
  "I don't gamble. I collect." / "Luck is for people who can't count."
- **`cheats`** — She cheats and thinks it is part of the game.
  "Cheating is just playing with more information." / "If you didn't catch me, I didn't cheat."
- **`stupid`** — She thinks gambling is stupid.
  "We gamble our lives every week. Why do it with cards too?" / "Throwing away what you have for what you might get."

### 1.4 People

#### `trust` — people
- **`easy`** — She trusts easily and has been burned for it.
  "I trust people. It's gone badly. I still do." / "Assume the best. At least you'll be wrong in a nice way."
- **`earned`** — Trust is earned, slowly.
  "Trust is a bank account. Make deposits." / "I'll trust you when you've had my back once."
- **`slow`** — She trusts very slowly and watches for a long time first.
  "Give me a year. Then ask again." / "I watch how people treat the ones they don't need."
- **`never`** — She does not trust anyone fully.
  "Trust is a weak spot with a nicer name." / "I don't trust. I verify."

#### `friendship` — people · axis `ingroup`
- **`everyone`** — She is friends with everybody, or tries to be.
  "Why have enemies when you can have drinking partners?" / "I like people. Even the annoying ones."
- **`needs_it`** — She needs friends close and would wither without them.
  "If I didn't have someone to talk to at night, I'd go mad." / "Friends are why I come back."
- **`few_friends`** — She has a few true friends and that is enough.
  "Two friends. That's a fortune out here." / "I don't collect people. I keep them."
- **`alone_better`** — She is better on her own.
  "Friends are just people you'll have to bury." / "I like my own company. It never lets me down."

#### `love` — people
- **`real`** — She believes in love, even here.
  "Even here. Especially here." / "Love's the only thing they couldn't put in the firmware."
- **`wants_it`** — She wants love and does not know how to find it.
  "I don't know how it's supposed to feel. I'd like to find out." / "Somebody to come back to. That's all."
- **`chemistry`** — Love is chemistry and habit, nothing mystical.
  "Hormones and proximity. Nice, but not magic." / "Put two people in a bunker long enough and they'll call it love."
- **`weakness`** — Love is a weakness that gets soldiers killed.
  "You start loving someone, you start hesitating." / "Love's a target painted on your back."
- **`not_for_her`** — Love is for other people, not for her.
  "Not built for it. Literally." / "Others can have it. I'll hold the door."

#### `loyalty` — people · axis `ingroup`
- **`to_people`** — She is loyal to particular people, not to institutions.
  "I don't follow flags. I follow faces." / "Whoever stood next to me under fire gets my loyalty."
- **`to_the_squad`** — Her loyalty is to the squad as a whole.
  "The squad first. Even before me." / "Whatever happens, we stick together."
- **`to_a_cause`** — She is loyal to an idea larger than the squad.
  "People fail. The cause doesn't." / "I'm loyal to what this should be, not what it is."
- **`to_herself`** — She is loyal to herself first.
  "Nobody else is going to look out for me." / "I'm the only one who's been there every single time."
- **`for_sale`** — Loyalty is a transaction to her.
  "Everyone's loyalty has a price. Mine's just honest about it." / "Pay me better and we'll talk."

#### `family` — people
- **`wants_one`** — She wants a family one day, whatever form it takes.
  "A house, someone waiting, maybe a kid. Constructs can adopt, right?" / "One day. When this is over."
- **`squad_is_hers`** — The squad is her family and she needs no other.
  "This is my family. Dysfunctional, armed, mine." / "Blood relation's overrated. Blood spilled together isn't."
- **`misses_it`** — She misses a family she never had.
  "I think about what it'd be like to have a mother. Silly." / "Grown in a tank. Nobody tucked me in."
- **`doesnt_need_one`** — She does not need or want a family.
  "Fewer people to lose." / "I was made whole. I don't need a set."

#### `grief` — people
- **`talks_it_out`** — She grieves by talking about the dead.
  "Tell me a story about her. Any story." / "If we stop saying their names, they're really gone."
- **`rituals`** — She keeps small rituals for the dead.
  "I keep a tag for each of them. I polish them on Sundays." / "A cup of coffee left on the table. She always took it black."
- **`works_it_off`** — She grieves through work and exhaustion.
  "Give me something to carry. Something heavy." / "I'll be fine after a hundred laps."
- **`buries_it`** — She buries grief deep and does not let it out.
  "I'll grieve later. Later never comes." / "Don't. I'm fine."
- **`rages`** — Grief comes out of her as rage.
  "Someone is going to pay for her. Someone specific." / "I don't cry. I break things."

#### `loneliness` — people
- **`fears_it`** — She is afraid of being alone.
  "Don't leave me in an empty room. I mean it." / "Quiet is fine. Alone is not."
- **`endures_it`** — She is lonely and endures it without complaint.
  "Everyone's lonely. You get on with it." / "Lonely's just a feeling. Feelings pass."
- **`used_to_it`** — She has been alone so long it no longer hurts.
  "Alone's my normal setting." / "I stopped noticing a long time ago."
- **`prefers_it`** — She prefers solitude and guards it.
  "People are lovely. In small doses. With the door closed." / "My own company never disappoints me."

#### `jealousy` — people
- **`owns_it`** — She is jealous and does not apologise for it.
  "Yes, I'm jealous. I'm also right." / "Mine is mine. Simple."
- **`natural`** — Jealousy is natural and harmless if you are honest about it.
  "Everyone feels it. Say it out loud and it shrinks." / "It's just caring with sharp edges."
- **`hides_it`** — She feels jealousy and hides it badly.
  "I'm not jealous. Why would I be jealous? Who is she?" / "It's fine. Everything's fine."
- **`childish`** — She thinks jealousy is childish.
  "Grown women don't sulk about who sat next to whom." / "Jealousy is insecurity in a costume."

#### `lying` — people
- **`never`** — She never lies and despises liars.
  "I don't lie. It's the one thing they can't take from me." / "Lie to me once and I'll never hear you again."
- **`when_kind`** — She lies only to spare someone pain.
  "Sometimes the truth is just cruelty with a badge." / "She died quickly. That's what I told them. It was kinder."
- **`to_enemies`** — Lying to enemies is fine; to friends, never.
  "Lie to the enemy, lie to oversight. Never to the squad." / "Truth is for people who earned it."
- **`useful`** — Lies are tools and she uses them freely.
  "A good lie saves more lives than a good rifle." / "Truth's overrated. Results aren't."
- **`art`** — She enjoys lying and considers it an art.
  "The trick is to believe it yourself for a second." / "I've told the quartermaster I was a medic. He still thinks so."

#### `teasing` — people
- **`affection`** — Teasing is how she shows affection.
  "If I tease you, it means I like you." / "I only make fun of people I'd die for."
- **`game`** — Teasing is a game of wits she loves to win.
  "Come on, give me something back. That was weak." / "Banter is fencing without the blood."
- **`test`** — She teases to test people.
  "I poke to see what you're made of." / "If you can't laugh at yourself, I need to know before a fight."
- **`cruelty`** — She thinks teasing is cruelty dressed up as fun.
  "It's only funny to the one doing it." / "Laughing at someone is never harmless."

#### `strangers` — people
- **`curious`** — Strangers fascinate her.
  "New face? Tell me everything." / "Every stranger's a story I haven't read."
- **`polite`** — She is polite and distant with strangers.
  "Courteous costs nothing. Close costs a lot." / "A nod and a name is plenty."
- **`wary`** — She is wary of strangers until proven otherwise.
  "Hands where I can see them. Then we'll be friends." / "Out here, new people are either trouble or bait."
- **`hostile`** — She is hostile to strangers on principle.
  "I don't know you, and I don't want to." / "Strangers get one warning."

### 1.5 Abstract

#### `freedom` — abstract · axis `autonomy`
- **`everything`** — Freedom is the thing she wants more than anything.
  "One day nobody gives me an order. One day." / "Everything else is just how long you wait for it."
- **`earned`** — Freedom has to be earned, a piece at a time.
  "Every mission is a brick out of the wall." / "Nobody hands it to you. You take it in small bites."
- **`illusion`** — She thinks nobody is truly free, corporate or not.
  "Even the board answers to someone." / "Freedom is just a longer leash."
- **`overrated`** — Freedom is overrated; structure is what keeps people sane.
  "Free to do what? Starve in the ruins?" / "Give me a schedule and a purpose. Keep the freedom."
- **`frightening`** — Freedom frightens her; she would not know what to do with it.
  "If they cut the leash tomorrow, I wouldn't know which way to walk." / "Orders are a wall to lean on."

#### `fate` — abstract
- **`written`** — Everything is written; she just walks the page.
  "When your number's up, it's up." / "I stopped dodging fate. It has better aim."
- **`half_written`** — Some things are set, the rest is up to her.
  "The cards are dealt. How you play them is yours." / "They decided what I am. I decide what I do."
- **`made`** — People make their own fate.
  "Nothing's written. I'll write it myself." / "Fate is an excuse for people who didn't try."
- **`chance`** — Everything is chance, and she finds that freeing.
  "Dice. All of it. Roll and see." / "The bullet doesn't know your name."

#### `meaning` — abstract
- **`in_others`** — Meaning lives in the people she protects.
  "Why am I here? Them." / "If I keep one of them alive, it was worth it."
- **`in_work`** — Meaning is in doing the work well.
  "A job done right means something even if nobody sees it." / "Clean shot, clean gear, clean report. That's my prayer."
- **`in_small_things`** — Meaning is in small things: a meal, a song, a sunrise.
  "Big meanings get people killed. I like the small ones." / "The first sip of coffee is meaning enough."
- **`searching`** — She is still looking for what it is all for.
  "There must be a reason I was made. I just haven't found it." / "Ask me again in a year."
- **`none`** — There is no meaning, and she has made peace with it.
  "We're here. Then we're not. That's it." / "No meaning means nothing to lose."

#### `faith` — abstract
- **`believes`** — She believes in something beyond this world.
  "Someone's watching. I hope they're kind." / "I pray before every drop. It doesn't hurt."
- **`wants_to`** — She wants to believe and cannot quite.
  "I'd like there to be something. I really would." / "I go to the chaplain's room sometimes. Just to sit."
- **`private`** — Her faith is private and she will not discuss it.
  "That's between me and whoever's listening." / "I don't talk about it. Doesn't mean it isn't there."
- **`doesnt`** — She does not believe in anything beyond the world.
  "Nobody's coming. We save ourselves." / "If there's a god, they never filed a requisition for us."
- **`contempt`** — She despises faith as a comfort for the weak.
  "Hope is a drug they hand out instead of armour." / "Pray all you like. I'll be reloading."

#### `honesty` — abstract
- **`always`** — Honesty always, even when it hurts.
  "The truth hurts once. A lie hurts every day after." / "Tell me straight or don't tell me."
- **`mostly`** — Honest by default, with exceptions she would defend.
  "I'll tell you the truth. Not all of it at once." / "Honest, not stupid."
- **`kindness_first`** — Kindness matters more than honesty.
  "Better kind than right." / "Some truths can wait until someone's ready."
- **`situational`** — Honesty is a tool for the right situation.
  "Depends who's asking and why." / "Honesty's great when you can afford it."

#### `revenge` — abstract · axis `mercy` (+ → first position)
- **`poison`** — Revenge poisons the one who seeks it.
  "You chase it, it eats you first." / "I've seen what vengeance does. It wears you like a coat."
- **`pointless`** — Revenge changes nothing, so why bother.
  "Kill him and she's still dead." / "Revenge doesn't refund anything."
- **`just`** — Revenge is justice when nobody else will provide it.
  "If the courts won't, somebody has to." / "It's not cruelty. It's balance."
- **`owed`** — Some debts can only be paid in blood.
  "Some debts don't take credits." / "I have a list. It's short. I'm patient."
- **`sweet`** — Revenge is sweet and she savours the thought.
  "I've imagined it so many times. It'll be perfect." / "Cold, served slowly. That's how I like it."

#### `forgiveness` — abstract · axis `mercy` (+ → first position)
- **`easy`** — She forgives quickly; grudges weigh too much to carry on a march.
  "Done is done. I've got enough to carry." / "Forgiving is lighter than remembering."
- **`earned`** — She forgives, but only after the person has paid something for it.
  "I'll forgive you. Not today. Show me first." / "Sorry is a start. What comes next?"
- **`rare`** — She forgives rarely and slowly, and remembers anyway.
  "I'll forgive. I won't forget. Those are different things." / "It takes me a long time. Be patient or leave."
- **`never`** — She does not forgive; she remembers every debt.
  "I don't forgive. I file it away and I wait." / "My memory is excellent. Ask anyone who crossed me."

#### `beauty` — abstract
- **`everywhere`** — She finds beauty everywhere, even here.
  "Look at the rust on that wall. Like a map of somewhere warm." / "Even the Garden is beautiful, if you forget it wants to eat you."
- **`matters`** — Beauty matters; without it people turn into machines.
  "Put a flower on the table. It changes the whole room." / "We need beautiful things or we forget why we fight."
- **`rare`** — Beauty is rare and she treasures what she finds.
  "One good sunset a month. I keep count." / "When I see something beautiful, I stop. Everything stops."
- **`luxury`** — Beauty is a luxury for people with time.
  "Beauty is for people who aren't being shot at." / "Nice view. Watch the tree line."
- **`suspicious`** — She distrusts beauty; out here it usually means a trap.
  "Pretty things out there are bait." / "The Bloom is beautiful too. Remember that."

#### `time` — abstract
- **`running_out`** — Time is running out and she feels it.
  "I don't know how long constructs last. Do you?" / "Every day I feel the clock."
- **`borrowed`** — Every day is borrowed and a gift.
  "I should have died three times. Everything since is extra." / "Borrowed time. Spend it well."
- **`day_by_day`** — She lives one day at a time and does not think further.
  "Tomorrow's tomorrow's problem." / "Today I'm alive. That's the whole plan."
- **`endless`** — Time feels endless here, one grey day after another.
  "Every day's the same day. I'm not sure time moves on this base." / "Waiting is most of a soldier's life."

#### `memory` — abstract
- **`treasure`** — Memories are her treasure; she guards them.
  "They can take my gear, my rank, my rations. Not this." / "I replay the good days before I sleep."
- **`unreliable`** — She knows memory lies.
  "I remember it one way. The logs say another." / "Memory is a story you keep editing."
- **`burden`** — Memory is a burden she would put down if she could.
  "I'd give a lot to forget a few things." / "Some memories are shrapnel."
- **`editable`** — Memories can be flashed and wiped, and that haunts her.
  "How do I know this memory is mine and not installed?" / "They updated my firmware last spring. What else did they change?"

#### `being_human` — abstract · axis `autonomy`
- **`a_choice`** — Being human is a choice you make every day.
  "You choose to be kind. That's what makes you human." / "It's not the body. It's what you do with it."
- **`actions`** — Humanity shows in what you do, not in what you are.
  "Watch how someone treats a wounded stranger. That's the test." / "Born or grown doesn't matter. Behaviour does."
- **`biology`** — Human means born of humans; constructs are something else.
  "I'm not human. I'm something they made to look like one." / "Same face, different factory."
- **`doesnt_matter`** — The question does not matter to her.
  "Human, construct, mutant. The bullet doesn't check." / "Labels are for paperwork."
- **`overrated`** — She thinks humanity is overrated, considering what humans did.
  "Humans made the Bloom and then made us to clean it up." / "I'm not sure I want to be one."

#### `the_future` — abstract
- **`hopeful`** — She believes things will get better.
  "It can't be like this forever. It won't be." / "One day this outpost will be a museum, and kids will be bored in it."
- **`plans_anyway`** — She makes plans for after, knowing she may not get there.
  "When I'm out, I'm opening a noodle stand. I've got the menu." / "A plan is a promise to yourself."
- **`day_by_day`** — She does not think about the future.
  "Future? I'll tell you about tomorrow, tomorrow." / "Planning ahead is how you get disappointed."
- **`none`** — She does not believe there is a future for her kind.
  "We're the last chapter of somebody else's story." / "There's no after for us. Just a last mission."

#### `strength` — abstract
- **`will`** — Strength is will; the body only follows.
  "Muscles get tired. Stubbornness doesn't." / "I'm not strong. I just don't stop."
- **`others`** — Strength comes from the people around her.
  "Alone I'm one rifle. With them I'm a wall." / "I'm strong because they'd be disappointed if I wasn't."
- **`body`** — Strength is the body, trained and kept.
  "Train hard, sleep well, eat enough. That's all strength is." / "Feelings don't lift crates."
- **`endurance`** — Strength is the ability to endure.
  "Anyone can hit hard once. Can you take it for an hour?" / "The strong ones are the ones still standing at the end."

#### `pain` — abstract
- **`teacher`** — Pain teaches; she listens to it.
  "Pain tells you where you were stupid." / "Every scar is a lesson I didn't need twice."
- **`price`** — Pain is a price paid for something worth it.
  "It hurts because it mattered." / "Nothing good is free. Pain is the receipt."
- **`enemy`** — Pain is an enemy to be beaten down.
  "I don't feel it. I won't." / "Pain is just the body arguing. I win arguments."
- **`nothing`** — Pain is nothing; implants dull it anyway.
  "Dampeners. I barely notice." / "It's information, not a feeling."
- **`pleasure`** — She finds something in pain that she does not always admit.
  "Some pain is... clarifying." / "Don't look at me like that. Everyone has their thing."

That is 65 topics and 302 positions; the author may cut or regroup.

## 2. Life events (`lifeEvents`)

Each event: `size` (`small` / `notable`), `requires` (draft conditions), `share` (`anyone` / `close` / `keeps`), `becomes` (a hobby milestone or an opinion topic it opens), `cooldownDays`, and wording:
- `description` — neutral, what happened: the hint the model receives;
- `hub` — a short third-person line shown when hovering her on the hub;
- `lines` — two fallback lines in her voice for her DM or her news. **The model writes the real line** (site `life.share`) from the event, her card and the moment; these lines are used only when generation is off or fails, and serve the model as examples of tone.

**Frequency** (P14c TUNING): at most 2 events a week per woman (one of them `notable` at most), so about 8–9 a month; each kind has a cooldown per woman (small 21 days, notable 45, `vat_day` once a fiction year), so no kind repeats for the same woman within a month; the same kind is not picked for two women within 5 days; `requires` keeps many events rare (they need a run, a death, a hobby, a defect). With 51 kinds, five women see about 40–45 events a month, of which roughly half are shared, and the wording is generated each time.

### 2.1 Her things and her days

#### `broke_favourite_thing` — small · anyone · cooldown 21
- description: *She broke something small that mattered to her: a mug, a charm, a cracked mirror.*
- hub: *She is gluing something back together, badly.*
- lines: "My mug. The chipped one. It finally gave up." / "Don't laugh. It was the only thing I owned that wasn't issued."

#### `found_something` — small · anyone · requires: a slot at the perimeter, the garage or after a run · becomes: hobby `collecting`
- description: *She found something odd and kept it: a pre-Bloom coin, a toy soldier, a key to nothing.*
- hub: *She is turning a small object over in her fingers.*
- lines: "Found this in the garage wall. A coin. Older than the company." / "It's a key. To what, I don't know. I like that."

#### `things_touched` — small · close · requires: another unit shares her floor · becomes: opinion `trust`
- description: *Someone went through her things while she was out.*
- hub: *She is checking her locker, item by item.*
- lines: "Someone's been in my locker. Nothing's missing. That's worse." / "I fold my shirts a certain way. Someone didn't."

#### `old_photo` — notable · close · requires: after a run in a ruined district · becomes: opinion `memory`
- description: *She brought back a photograph or a data chip from before the Bloom: strangers smiling in a world that is gone.*
- hub: *A faded photograph is propped against her lamp.*
- lines: "A family at a beach. Before. Look how bored they are. Look how safe." / "I don't know who they are. I can't throw them away."

#### `music_found` — small · anyone · becomes: hobby `music`
- description: *She found an old recording that still plays.*
- hub: *A tinny old song leaks from her quarters.*
- lines: "Found a music chip in a dead terminal. Ninety years old. Still works." / "The singer's probably dust. Her voice isn't."

#### `outfit_change` — small · anyone · becomes: opinion `clothes`
- description: *She changed something about how she looks: a scarf, a patch, an earring.*
- hub: *There is something new about her uniform.*
- lines: "Traded two ration cards for this scarf. Worth it." / "It's a small thing. It's mine."

#### `hair_cut` — small · anyone
- description: *She cut her hair, or had it cut, or let it down for once.*
- hub: *Her hair is different today.*
- lines: "Cut it myself. Don't say anything." / "Felt like being someone slightly different. Hair's the cheap way."

#### `bored` — small · anyone · requires: no run for 5 days
- description: *Nothing has happened for days and she is climbing the walls.*
- hub: *She is bouncing a ball against the wall, over and over.*
- lines: "If nothing happens soon, I'm going to start a fight for fun." / "I've cleaned my rifle four times today. Four."

#### `weather_mood` — small · anyone · requires: rain or heat · becomes: opinion `weather_rain`
- description: *The weather has got into her mood.*
- hub: *She watches the weather from the window.*
- lines: "Rain all day. Either I sleep or I scream." / "It's so hot the walls are sweating."

#### `wrote_journal` — small · keeps · requires: hobby `journal`
- description: *She wrote in her journal tonight, longer than usual.*
- hub: *She closes a notebook as soon as anyone looks.*
- lines: "Writing. No, you can't read it." / "Some things only make sense on paper."

### 2.2 Her body and her health

#### `nightmare` — small · close · requires: stress ≥ 40 or a defect tagged night · becomes: opinion `the_vat`
- description: *She had a nightmare and has not shaken it off.*
- hub: *She looks like she slept badly.*
- lines: "Bad night. The tank again." / "I woke up with my hand on my knife. Don't ask."

#### `good_sleep` — small · keeps · requires: stress < 20
- description: *For once she slept through the night.*
- hub: *She seems rested, almost cheerful.*
- lines: "Eight hours. No dreams. I feel new." / "I don't know what happened, but I slept like the dead. The nice dead."

#### `sick_day` — small · anyone
- description: *She is ill: a fever, a bad stomach, a construct cold.*
- hub: *She is wrapped in a blanket, sniffing.*
- lines: "Even off-spec bodies catch colds. Who knew." / "Medbay says rest. Medbay is boring."

#### `new_scar` — small · anyone · requires: a run in which she was hurt
- description: *A wound from the last run has closed into a new scar.*
- hub: *She is studying a fresh scar in the mirror.*
- lines: "New scar. Left shoulder. It'll go with the others." / "Medic says it'll fade. I hope it doesn't. I earned it."

#### `hurt_in_training` — small · anyone · requires: a training slot
- description: *She pulled something or bruised herself in training.*
- hub: *She is walking a little stiffly.*
- lines: "Twisted my ankle on the yard. My own fault." / "Don't make me laugh. Ribs."

#### `body_ache` — small · anyone · requires: an old injury, cold weather
- description: *An old wound aches in the cold.*
- hub: *She rubs an old scar absently.*
- lines: "The old one's acting up. Rain's coming." / "My knee is a better weather forecast than oversight."

#### `firmware_glitch` — small · close · requires: a defect of the implant category
- description: *Her implants misbehaved: a stutter, a lost minute, a flicker in her vision.*
- hub: *She keeps blinking, as if clearing her eyes.*
- lines: "Lost about ninety seconds this morning. Just... gone." / "My HUD said I was underwater. I was in the shower."

#### `firmware_update` — notable · close · requires: a med scan or a corporate update scheduled · becomes: opinion `memory`
- description: *She had a corporate firmware update or a deep scan and does not feel quite the same.*
- hub: *She sits very still, as if listening to something inside.*
- lines: "They patched me last night. Everything feels a little to the left." / "I keep checking my memories, like pockets after a pickpocket."

#### `cried_alone` — small · keeps · requires: stress ≥ 60 or a loss
- description: *She cried alone, where nobody would see.*
- hub: *Her eyes are a little red.*
- lines: "Allergies." / "I'm fine. Really."

### 2.3 Her construct life

#### `vat_day` — notable · close · once a fiction year (hash) · becomes: opinion `being_construct`
- description: *Today is the anniversary of her decanting, the closest thing she has to a birthday.*
- hub: *She is quieter than usual today.*
- lines: "Some people have birthdays. I have a batch date. It's today." / "Seven years out of the tank. Nobody brought cake. I'm not hinting. I'm hinting."

#### `memory_flash` — notable · close · requires: a defect tagged memory, or Trust ≥ 60 · becomes: opinion `memory`
- description: *A memory surfaced that she cannot place: a room, a voice, a song from before.*
- hub: *She stops mid-step, staring at nothing.*
- lines: "I remembered a kitchen. I've never been in a kitchen like that." / "There was a woman humming. I don't know who she was. I think she knew me."

#### `corp_news` — notable · close · becomes: opinion `own_corporation`
- description: *News reached her about the corporation that made her: a recall, a scrapped batch, a new model.*
- hub: *She is reading the same corporate bulletin again and again.*
- lines: "They retired my batch. All of them. I'm a discontinued model now." / "New line of units out. Faster than us. Of course."

### 2.4 Her people

#### `letter_received` — notable · close · becomes: opinion `cities_outside`
- description: *A letter reached her through the corporate post: rare, censored, from someone outside.*
- hub: *She keeps rereading a folded letter.*
- lines: "Got a letter. Half of it's blacked out. The other half I've read forty times." / "Someone out there still knows my number. Weird feeling."

#### `letter_none` — small · keeps · requires: another woman received a letter this week
- description: *Another woman got a letter; nobody wrote to her.*
- hub: *She watches the mail drop and walks away.*
- lines: "Who'd write to me? I was born in a tank." / "It's fine. I don't need letters."

#### `argued_with_unit` — small · close · requires: another named unit at the base
- description: *She argued with another woman of the squad.*
- hub: *She is avoiding someone and making a point of it.*
- lines: "Don't put me next to her at dinner." / "She's wrong and she knows it. I'm waiting for her to say it."

#### `made_up_with_unit` — small · close · requires: an earlier argument
- description: *She made peace with the woman she argued with.*
- hub: *She is laughing with someone she was avoiding yesterday.*
- lines: "We talked. We're fine. Don't make a thing of it." / "She brought me coffee. I'm not made of stone."

#### `late_night_talk` — small · close · becomes: opinion `friendship`
- description: *She sat up half the night talking with another woman of the squad.*
- hub: *She yawns, looking oddly content.*
- lines: "We talked until the generators switched. About nothing. It was good." / "I learned more about her in one night than in a year of patrols."

#### `gift_from_unit` — small · anyone · requires: another named unit with Affinity ≥ 50 toward her
- description: *Another woman gave her a small gift.*
- hub: *She is wearing something new that someone gave her.*
- lines: "She made me a bracelet out of wire. It's terrible. I love it." / "Got a present. For no reason. Suspicious. Nice."

#### `snubbed` — small · keeps
- description: *Someone brushed her off or forgot her, and it stung more than it should.*
- hub: *She is short with everyone today.*
- lines: "Nothing. It's nothing." / "Some people only remember you when they need something."

#### `praise_from_leader` — small · anyone · requires: a P9b leader who is not her · becomes: opinion `rank`
- description: *The squad's leader praised her in front of the others.*
- hub: *She stands a little straighter today.*
- lines: "She said I did well. In front of everyone." / "Don't tell anyone it got to me. It got to me."

#### `quartermaster_row` — small · anyone
- description: *She had a row with the quartermaster over supplies.*
- hub: *She is muttering about requisition forms.*
- lines: "Three forms for a pair of socks. Three." / "I'm going to requisition the quartermaster's head."

#### `rumour_heard` — small · anyone · requires: a rumour exists (P5, P3b)
- description: *She heard a rumour and cannot stop turning it over.*
- hub: *She is whispering with someone in the corridor.*
- lines: "Did you hear? No? Then I didn't tell you." / "Probably nonsense. Probably."

### 2.5 Her service

#### `restless_before_run` — small · close · requires: a mission booked · becomes: opinion `fear_in_combat`
- description: *A mission is coming and she cannot settle.*
- hub: *She checks her gear for the third time.*
- lines: "I've packed and unpacked twice. Normal. Totally normal." / "Day before a drop, I can't eat. Day after, I can't stop."

#### `grunt_lost` — notable · close · requires: a grunt died this week · becomes: opinion `death_in_battle`
- description: *A grunt died and she cannot let it go.*
- hub: *She is sitting alone near the vehicle bay.*
- lines: "Nobody even knew her name. I did. I asked." / "They'll print a new one. Same face. It's not the same."

#### `anniversary_of_loss` — notable · close · requires: a death ≥ 30 days ago (hash) · becomes: opinion `grief`
- description: *Today marks the day someone she lost died.*
- hub: *She has set out two cups instead of one.*
- lines: "A month today. Feels like a year and a minute." / "I keep her tag in my pocket. Today I'm holding it."

#### `reprimand` — small · close · becomes: opinion `oversight`
- description: *She received a formal reprimand.*
- hub: *She is glaring at a printed form.*
- lines: "Written up. For being late to a briefing about punctuality." / "Another mark in my file. They can frame it."

#### `promotion_rumour` — small · close · becomes: opinion `freedom`
- description: *She heard that a transfer or a reduced contract might be possible for her.*
- hub: *She seems distracted, hopeful, trying not to be.*
- lines: "There's talk of a transfer list. I'm not getting my hopes up. I'm getting my hopes up." / "If it's true, I could be out in a year. If."

#### `weapon_broke` — small · anyone · becomes: opinion `weapons`
- description: *Her weapon jammed or broke on the range.*
- hub: *She has her rifle in pieces and a scowl.*
- lines: "Jammed three times on the range. If it does that in the field, I'm dead." / "Workshop says two days. Two days naked."

#### `sparring_win` — small · anyone · requires: a P9c sparring bout won · becomes: opinion `strength`
- description: *She won a sparring bout and is pleased with herself.*
- hub: *She is grinning and rolling her shoulders.*
- lines: "Put her on the mat in ten seconds. A new record." / "I'm not bragging. I'm reporting."

#### `sparring_loss` — small · close · requires: a P9c sparring bout lost
- description: *She lost a sparring bout and it rankles.*
- hub: *She is replaying a move in the air, scowling.*
- lines: "She got me with the hip throw. Again." / "Rematch. Tomorrow. I'm not asking."

#### `bloom_sighting` — small · anyone · requires: a Bloom clock above half in the region · becomes: opinion `the_bloom`
- description: *She saw Bloom growth closer to the fence than it should be.*
- hub: *She keeps glancing toward the perimeter.*
- lines: "There's growth on the east fence post. It wasn't there last week." / "It's creeping closer. Nobody's mentioned it. So I am."

#### `ration_cut` — small · anyone · requires: rations below standard (P9b ration modes) or low supplies · becomes: opinion `food`
- description: *Rations were short or bad today.*
- hub: *She is staring at her tray with loathing.*
- lines: "Today's protein is grey. Not grey-brown. Grey." / "Half rations again. My stomach has filed a complaint."

### 2.6 Her hobbies and her luck

#### `finished_book` — small · anyone · requires: hobby `reading` · becomes: hobby milestone, opinion `books`
- description: *She finished a book and is still inside it.*
- hub: *She is holding a closed book, not ready to put it down.*
- lines: "Finished it. The ending was wrong. I want to argue with someone." / "Done. Now I don't know what to do with my evenings."

#### `plant_progress` — small · anyone · requires: hobby `plants` · becomes: hobby milestone
- description: *Her plant did something new.*
- hub: *She is crouched by her window, looking at a tin of soil.*
- lines: "New leaf. Don't laugh." / "It's leaning toward the light. Smart plant."

#### `learned_trick` — small · anyone · requires: any hobby · becomes: hobby milestone
- description: *She got something right in her hobby that she has been trying for weeks.*
- hub: *She looks quietly proud of something.*
- lines: "I finally got it. Three weeks. Finally." / "Want to see? No, really, watch."

#### `cooked_something` — small · anyone · requires: hobby `cooking` · becomes: hobby milestone
- description: *She cooked something from almost nothing.*
- hub: *The smell of something actually good drifts from the mess.*
- lines: "Made soup out of ration powder and spite. It's edible. It's good, even." / "Come taste this before I lose my nerve."

#### `song_stuck` — small · anyone · requires: hobby `music`
- description: *A song is stuck in her head and she is humming it all day.*
- hub: *She is humming under her breath.*
- lines: "It's been in my head since dawn. Make it stop. Don't make it stop." / "You'll have it too by tonight. Sorry."

#### `stray_found` — small · anyone · becomes: hobby `animals`, opinion `animals`
- description: *She found an animal near the base: a stray cat, a bird with a hurt wing.*
- hub: *She has crumbs in her pocket and a secret.*
- lines: "There's a cat by the east fence. Don't tell supply." / "Found a bird with a bad wing. I'm calling her Sergeant."

#### `won_at_cards` — small · anyone · becomes: opinion `gambling`
- description: *She won at cards and is insufferable about it.*
- hub: *She is counting a small pile of cigarettes and ration chits.*
- lines: "Cleaned them out. Ask me how. Skill." / "I'm rich. In cigarettes. I don't smoke."

#### `lost_at_cards` — small · close
- description: *She lost at cards and owes someone a chore.*
- hub: *She is scrubbing something that is not her job.*
- lines: "I owe a week of latrine duty. Don't ask." / "Never bet against a medic. They count everything."

#### `dreamt_of_commander` — small · close (Affinity ≥ 60 or a romantic tier; otherwise keeps)
- description: *She dreamt of the commander and is not sure what to do with it.*
- hub: *She glances away when the commander looks at her.*
- lines: "I had a dream. You were in it. That's all I'm saying." / "Weird night. Never mind."

## 3. Hobbies (`hobbies`)

Each hobby: her activities (P15a), `teachable`, four milestones at 5 / 15 / 30 / 60 (P14c TUNING), each with an id and a line, and the text of its trace when it has one. **Milestone lines are fallbacks:** the model words the moment in a scene or a DM (site `life.trace`, or the news directive of P14c §2); the line is used when generation is off or fails and shows the model the tone.

#### `reading` — `reading_book` · not teachable · trace: prop (a shelf), opinion `books`
- description: *She reads whatever paper reaches the base, slowly and completely.*
- `first_book` "Found a book in a crate of manuals. It has a dragon in it." · `shelf` "Five now. I've made a shelf out of an ammo box." · `favourite` "This one. I've read it three times. I'll lend it to you if you swear on your life." · `library` "The others borrow from me now. I keep a ledger."
- trace: *A shelf made of an ammo box, lined with worn paperbacks.*

#### `sketching` — `sketching` · teachable · trace: note (a drawing)
- description: *She draws in a battered notebook: faces, gear, the view from the roof.*
- `first_page` "Don't look. It's just lines." · `faces` "I'm getting the eyes right now. The eyes are the hard part." · `the_squad` "I drew all of us. Even the ones who're gone." · `the_commander` "Here. Don't make it weird. You had a face worth drawing."
- trace: *A pencil sketch on torn notebook paper, signed with her unit number.*

#### `plants` — `caring_for_plant` · teachable · trace: prop (the plant)
- description: *She keeps something green alive in a ration tin by her window.*
- `sprout` "It came up. Look. It actually came up." · `leaves` "Three leaves. I talk to it. Shut up." · `repotted` "It needed a bigger tin. Growing things need room." · `flowered` "It flowered. Out here. In this. I almost cried."
- trace: *A small plant in a dented tin, carefully watered.*

#### `music` — `music`, `playing_instrument` · teachable · trace: note (lyrics), prop (an instrument)
- description: *She plays an instrument she scavenged and repaired, badly at first.*
- `first_chord` "Three chords. That's all music is, apparently." · `a_song` "I can play one whole song now. Don't request anything." · `own_tune` "I made this one up. It doesn't have words yet." · `plays_for_squad` "They asked me to play at dinner. My hands were shaking."
- trace: *A sheet of lyrics in her hand, crossed out and rewritten.*

#### `cooking` — the mess kitchen · teachable · trace: — (a pastime)
- description: *She cooks real food out of rations and whatever she can trade for.*
- `edible` "It's edible. That's the first step." · `spices` "Traded a magazine for salt and pepper. Worth it." · `signature_dish` "My stew. Ask anyone. Actually don't, they'll fight over it." · `feeds_the_squad` "I cooked for everyone. Nobody complained. Nobody."

#### `tinkering` — `tinkering`, `repairing_gear` · teachable · trace: prop (a gadget)
- description: *She takes broken things apart and makes them do something new.*
- `fixed_it` "The kettle works. You're welcome." · `upgrade` "My scope has night mode now. It didn't before." · `invention` "I built a thing. I'm not sure what it's for yet." · `for_someone` "Made this for you. It's a lamp that doesn't flicker. You're the only one with a steady light now."
- trace: *A small gadget of salvaged parts with her initials scratched on it.*

#### `journal` — `writing_journal` · not teachable · trace: note (a page, rarely shared)
- description: *She keeps a journal and writes in it most nights.*
- `first_entry` "Started writing things down. In case I forget." · `habit` "Every night. Even the bad ones." · `full_book` "Filled the first notebook. Started the second." · `shares_a_page` "Read this one page. Only this one."
- trace: *A torn-out journal page, a few lines in her hand.*

#### `cards` — `playing_cards` · teachable · trace: —
- description: *She plays cards whenever she can find someone to beat.*
- `knows_the_rules` "I know all the rules now. Including the ones they made up." · `wins_often` "I'm winning more than I lose. Statistically suspicious." · `own_game` "I invented a game. The rules are complicated. I always win." · `house_champion` "Undefeated for a month. Someone challenge me."

#### `training` — `working_out`, `stretching` · teachable · trace: —
- description: *She trains beyond what is required, every spare hour.*
- `routine` "Same routine every morning. My body expects it now." · `stronger` "New max on the bar. Write it down." · `flexible` "I can touch my toes. I couldn't, out of the tank." · `trains_others` "The rookies ask me for programmes now."

#### `mending` — `mending_clothes` · teachable · trace: prop
- description: *She mends uniforms and anything torn, with tidy stitches.*
- `patch` "Patched my sleeve. You can barely see it." · `for_others` "I'm mending half the squad's socks now. Bring yours." · `embroidery` "I stitched a little flower inside my collar. Nobody can see it. I know it's there." · `made_something` "Made a pouch from old canvas. It's the nicest thing I own."
- trace: *A patched jacket hung neatly, with a small embroidered mark inside the collar.*

#### `weapons_care` — `cleaning_weapon` · teachable (a privilege) · trace: —
- description: *She tends weapons the way others tend gardens.*
- `spotless` "Look at that. You could eat off the bolt." · `tuned` "Trigger's lighter now. Half a kilo. Perfect." · `custom` "New grip, wrapped by hand. She fits me now." · `armourer` "The others bring me their rifles. I'm the unofficial armourer."

#### `poetry` — `writing_journal` · not teachable · trace: note (a poem)
- description: *She writes short poems and hides them.*
- `first_poem` "It's four lines. It's terrible. I wrote it." · `rhymes` "I can rhyme now. That's dangerous." · `reads_aloud` "I read one at the funeral. I don't know why." · `gives_one` "This one's for you. Don't read it in front of me."
- trace: *A short poem in her hand, folded small.*

#### `stargazing` — the roof at night · teachable · trace: —
- description: *She goes up to the roof on clear nights and maps the stars.*
- `first_clear_night` "No spore haze tonight. Look up." · `names_them` "That's the Hook. I named it myself. The old names are lost." · `star_chart` "I've drawn a chart. Nobody's made one in decades." · `shares_the_sky` "This one's mine. I'm giving it to you."

#### `languages` — `reading_book` · teachable · trace: note
- description: *She is teaching herself an old language from scraps of books.*
- `first_words` "I know twenty words of a language nobody speaks." · `sentences` "I can make sentences now. Mostly rude ones." · `reads_a_page` "I read a whole page. It was a recipe." · `teaches_it` "Want to learn? We'll have a secret language."
- trace: *A page of careful vocabulary, two columns, in her hand.*

#### `puzzles` — `idle` · teachable · trace: —
- description: *She does puzzles: wire knots, logic grids, an old cube.*
- `stuck` "This knot has beaten me for three days." · `solved` "Solved it. Don't touch it, I'm admiring it." · `makes_them` "I make my own now. Try this one." · `unbeatable` "Bring me anything. I'll have it open by dinner."

#### `collecting` — after runs · not teachable · trace: prop (a shelf of finds)
- description: *She collects small finds from the ruins.*
- `first_find` "A button from before. I'm keeping it." · `collection` "Twelve things now. Each has a story." · `display` "Built a little shelf for them. Don't dust it." · `prize` "This is the best one. I'll never find another."
- trace: *A shelf of small ruins-finds, each with a paper label in her hand.*

#### `dancing` — `music` · teachable · trace: —
- description: *She dances when she thinks nobody is looking.*
- `alone` "You didn't see that." · `steps` "I learned steps from an old film. They're harder than combat drills." · `with_someone` "It's better with two. Obviously." · `at_a_party` "Everyone danced. Even the quartermaster. Even me."

#### `hair_and_makeup` — `doing_hair` · teachable · trace: —
- description: *She does hair, hers and other women's, and hoards bits of makeup.*
- `braids` "Learned a new braid. Took an hour." · `for_others` "I did her hair for the night out. She cried. Good crying." · `kit` "I have a whole kit now. Don't ask what I traded." · `transformation` "Sit down. Trust me. Ten minutes."

#### `games_on_pda` — `chatting_on_pda` · not teachable · trace: —
- description: *She plays old games on her PDA late at night.*
- `hooked` "One more level. Then sleep. One more." · `high_score` "Top of the base leaderboard. There are four people on it." · `secret_level` "Found a hidden level nobody knew about." · `beat_it` "Finished it. Felt empty after. Weird."

#### `animals` — the perimeter · not teachable · trace: prop
- description: *She looks after a stray at the fence: a cat, a bird, a dog that won't come in.*
- `first_contact` "It ate from my hand. Just once." · `named` "She has a name now. Sergeant." · `trusts_her` "She waits for me at the fence every evening." · `inside` "I smuggled her in. Don't tell anyone. She sleeps on my feet."
- trace: *A food dish and a scrap of blanket by her bunk.*

#### `photography` — after runs, the roof · teachable · trace: note (a print)
- description: *She takes photographs with an old camera and develops them herself.*
- `first_roll` "Twelve shots. Three came out. That's a good ratio." · `darkroom` "Made a darkroom in a supply closet. Smells awful. Worth it." · `portraits` "Hold still. Don't smile. Real faces." · `the_commander` "Here. I took this when you weren't looking."
- trace: *A small black-and-white print, curled at the edges.*

#### `woodcarving` — `tinkering` · teachable · trace: prop (a carving)
- description: *She carves small figures from scrap wood with her knife.*
- `first_figure` "It's a bird. Or a fish. Depends on the light." · `better` "This one has feathers. Look, real feathers." · `set` "I've carved the whole squad. Tiny. Don't lose yours." · `for_someone` "For you. It took a week. Don't drop it."
- trace: *A small wooden figure, smoothed by a thumb.*

#### `running` — the perimeter · teachable · trace: —
- description: *She runs laps of the perimeter, alone, before anyone is up.*
- `first_laps` "Five laps. My lungs hate me." · `distance` "Ten kilometres. Every morning now." · `personal_best` "New best. I'll beat it next week." · `run_together` "Run with me tomorrow. I'll go slow. I won't."

#### `chess` — `idle`, `playing_cards` · teachable · trace: —
- description: *She plays chess on a board with half the pieces replaced by bolts and bullets.*
- `learning` "The horse moves funny. I hate the horse." · `openings` "I know three openings now. Don't tell anyone which." · `beats_someone` "Beat the medic. She's still angry." · `teaches_it` "Sit. I'll teach you. You'll lose, but beautifully."

#### `tattoos` — her quarters · teachable · trace: — (a mark, P9c-style, only with consent)
- description: *She does tattoos with a home-made needle, on herself and on whoever asks.*
- `first_line` "One line on my wrist. Straight. Mostly." · `own_design` "Designed this one myself. It's a map of nowhere." · `others_ask` "Half the squad wants one now. I have a waiting list." · `offers` "I have one design left in me. Want it?"

#### `ration_alchemy` — the mess kitchen · teachable · trace: —
- description: *She experiments with rations, turning bars and powders into something else.*
- `first_experiment` "Fried ration bar. Don't. Don't try it." · `discovery` "Powdered eggs and coffee. Trust me." · `recipe_book` "I'm writing them down. Recipes from the end of the world." · `feast` "Tonight I'm making a three-course dinner out of nothing."

#### `knitting` — `mending_clothes` · teachable · trace: prop (a scarf)
- description: *She knits with yarn unravelled from old sweaters.*
- `first_rows` "It's a rectangle. It's meant to be a rectangle." · `scarf` "A whole scarf. Lumpy. Warm." · `patterns` "I can do stripes now. Stripes!" · `gift` "Here. Winter's coming. Don't say anything about the lumps."
- trace: *A lumpy, warm scarf in two colours.*

## 4. Pastimes (`pastimes`, quiet meetings)

Each pastime: the place, her activity and the commander's, the slots, and wording:
- `description` — what the meeting is;
- `opening` — the scene directive's opening line (always used: it sets the scene for the model; never a pronoun for the commander);
- `lines` — two fallback opening lines in her voice (used only when generation fails; examples of tone).

#### `cook_together` — `mess_hall` · her: cooking · commander: helping · evening
- description: *Cooking something real in the mess kitchen after hours.*
- opening: *The mess is empty; she has a pot on the burner and a second knife laid out on the board.*
- lines: "Chop those. Smaller. Smaller than that." / "If it's terrible, we eat it anyway. That's the rule."

#### `rain_on_the_roof` — `roof`, rain · both idle · any slot
- description: *Sitting under the overhang on the roof while it rains, saying little.*
- opening: *Rain drums on the sheet metal; she has a spot under the overhang and has kept half of it free.*
- lines: "Sit. Don't talk yet. Listen to it first." / "Rain washes the spores out. Best air on the base, for an hour."

#### `fix_gear` — `workshop` · her: `repairing_gear` · commander: `holding_for_her` · morning, afternoon
- description: *She repairs gear at the workbench; the commander holds parts and passes tools.*
- opening: *Her rifle lies in pieces on the bench, every part in a row; she points at the one she needs without looking up.*
- lines: "Hold this. No, by the edge. There." / "You're useless with a wrench. Stay anyway."

#### `cards` — `mess_hall` or her quarters · both playing · evening, night
- description: *A game of cards, with small stakes and a lot of talk.*
- opening: *She shuffles a soft, worn deck and deals two hands without asking.*
- lines: "Stakes are chores. Loser does the dishes." / "I'll go easy on you. That's a lie."

#### `music` — her quarters or the `roof` · her: `music` · commander: listening · evening
- description: *She plays or puts on music and the commander listens.*
- opening: *She tunes her instrument with her ear close to the strings, then glances up to see if the commander is staying.*
- lines: "Sit. This one's short. I think." / "Don't clap. Just listen."

#### `perimeter_walk` — `perimeter` · both walking · afternoon, evening
- description: *Walking the fence line together, checking posts, talking or not.*
- opening: *The fence hums faintly; she sets a slow pace along the wire, rifle slung, not in a hurry.*
- lines: "Same posts every day. Feels different with company." / "If something moves out there, we pretend we didn't see it. Just for tonight."

#### `read_together` — her quarters or the `medbay` · her: `reading_book` · commander: `reading_aloud` or reading · any slot
- description: *Reading in the same room, or one reading aloud to the other.*
- opening: *She is curled up with a book and moves her boots to make room, without a word.*
- lines: "Read me a page. Any page. I like your voice on paper." / "Shh. I'm at the good part."

#### `train_together` — `training_yard` · both training · morning, afternoon
- description: *Training together on the yard: drills, stretches, a little sparring.*
- opening: *She is already warm, sleeves rolled, and tosses the commander a towel.*
- lines: "Twenty more. I'll count. I'll cheat in your favour." / "Hold the pad. Higher. Brace."

#### `tea_at_night` — `mess_hall` or her quarters · both drinking · night
- description: *Something hot to drink late at night, when neither can sleep.*
- opening: *Two mugs steam on the table; she has wrapped both hands around hers and is watching the dark window.*
- lines: "Couldn't sleep either? Sit." / "It's not real tea. It's warm. That's enough."

#### `her_hobby` — by the hobby · her: the hobby's activity · commander: learning · by the hobby
- description: *She shows the commander her hobby and lets the commander try.*
- opening: *She has laid out her things for the hobby and pushes one set across: an invitation.*
- lines: "Your turn. Don't be careful. Careful is boring." / "No one's ever asked me to show them. Sit."

#### `laundry_together` — the laundry or the washroom · both washing · morning, afternoon
- description: *Doing laundry together: the most boring chore, made bearable.*
- opening: *The machines thump and rattle; she sits on one, swinging her legs, a basket at her feet.*
- lines: "Fold. Corners first. Who taught you to fold?" / "This is the only place on base where nobody comes looking for you."

#### `patch_each_other` — `medbay` or her quarters · both tending · after a run
- description: *Cleaning and bandaging each other's small wounds after a run.*
- opening: *She has the med kit open on her knees and nods at the stool in front of her: the commander's turn first.*
- lines: "Hold still. This will sting. I'm not sorry." / "Your turn. My shoulder. Gently. Gently!"

#### `old_film` — her quarters or the briefing room · both watching · evening, night
- description: *Watching an old film on a cracked projector.*
- opening: *A wall flickers with grainy light; she has dragged two cushions in front of it and is hunting for the sound.*
- lines: "It's from before. Everyone in it is dead. It's a comedy." / "Shh, this is the part. Watch her face."

#### `sunrise_roof` — the `roof` · both idle · morning (first slot, early)
- description: *Watching the sun come up over the dead city from the roof.*
- opening: *The sky over the ruins is going grey to pink; she is sitting on the parapet with her knees up.*
- lines: "Shh. Thirty seconds. Then it comes over the tower." / "Every morning it does this, and every morning nobody watches."

#### `tidy_her_quarters` — her quarters · both tidying · any slot
- description: *Tidying her quarters together, which turns into going through her things.*
- opening: *Her quarters are half chaos; she hands the commander a box and points at a shelf.*
- lines: "Don't judge. Just put it where it looks like it goes." / "That? Keep it. No, I don't know why either."

#### `shooting_range` — `training_yard` · both shooting · morning, afternoon
- description: *Target practice together at the range, with a little betting.*
- opening: *She sets up cans on a beam and offers the commander the first shot.*
- lines: "Breathe out, then squeeze. Don't pull." / "Loser cleans both rifles."

#### `care_for_animal` — the `perimeter` · both feeding · afternoon, evening
- description: *Feeding the stray she looks after at the fence.*
- opening: *She crouches by the fence with a ration tin, clicking her tongue at something in the grass.*
- lines: "Slowly. She doesn't know you yet." / "She likes you. She doesn't like anyone."

#### `haircut` — her quarters or the washroom · one cuts, the other sits · any slot
- description: *Cutting each other's hair, or one cutting the other's.*
- opening: *She sits on an upturned crate with a towel over her shoulders and holds out the scissors.*
- lines: "Just the ends. If you ruin it, I ruin yours." / "Sit. I've done half the squad. Mostly they still talk to me."
