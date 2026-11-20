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

| id | size | requires (draft) | share | becomes |
|---|---|---|---|---|
| `letter_received` | notable | — | close | opinion: `cities_outside` |
| `letter_none` | small | another got a letter | keeps | — |
| `broke_favourite_thing` | small | — | anyone | — |
| `found_something` | small | slot in perimeter / garage | anyone | — |
| `finished_book` | small | hobby `reading` | anyone | hobby milestone, opinion: `books` |
| `plant_progress` | small | hobby `plants` | anyone | hobby milestone |
| `argued_with_unit` | small | another named unit at base | close | — |
| `made_up_with_unit` | small | an earlier `argued_with_unit` | close | — |
| `nightmare` | small | stress ≥ 40 or defect tag `night` | close | opinion: `the_vat` |
| `good_sleep` | small | stress < 20 | keeps | — |
| `vat_day` | notable | a fixed day per unit (hash) | close | opinion: `being_construct` |
| `firmware_glitch` | small | defect category implant | close | — |
| `sick_day` | small | — | anyone | — |
| `new_scar` | small | after a run with injury | anyone | — |
| `learned_trick` | small | hobby any | anyone | hobby milestone |
| `won_at_cards` | small | — | anyone | opinion: `gambling` |
| `lost_at_cards` | small | — | close | — |
| `cooked_something` | small | hobby `cooking` | anyone | hobby milestone |
| `song_stuck` | small | hobby `music` | anyone | — |
| `memory_flash` | notable | defect tag memory, or Trust ≥ 60 | close | opinion: `memory` |
| `rumour_heard` | small | P5/P3b rumour exists | anyone | — |
| `grunt_lost` | notable | a grunt died this week | close | opinion: `death_in_battle` |
| `anniversary_of_loss` | notable | a named or grunt death ≥ 30 days ago (hash) | close | opinion: `grief` |
| `praise_from_leader` | small | P9b leader exists, not her | anyone | opinion: `rank` |
| `snubbed` | small | — | keeps | — |
| `weather_mood` | small | weather (rain, heat) | anyone | opinion: `weather_rain` |
| `bored` | small | no run for 5 days | anyone | — |
| `restless_before_run` | small | a mission is booked | close | opinion: `fear_in_combat` |
| `gift_from_unit` | small | another named unit with Affinity ≥ 50 toward her (narrow, P17a-like) | anyone | — |
| `outfit_change` | small | — | anyone | opinion: `clothes` |
| `wrote_journal` | small | hobby `journal` | keeps | hobby milestone |

## 3. Hobbies (`hobbies`)

| id | her activities (P15a) | teachable | traces |
|---|---|---|---|
| `reading` | `reading_book` | no | prop (a shelf), opinion (books) |
| `sketching` | `sketching` | yes | note (a drawing; at the last milestone, of the commander) |
| `plants` | `caring_for_plant` | yes | prop (the plant grows, flowers) |
| `music` | `music`, `playing_instrument` | yes | note (lyrics), prop (an instrument) |
| `cooking` | `eating` + mess kitchen | yes | — (a pastime) |
| `tinkering` | `tinkering`, `repairing_gear` | yes | prop (a gadget) |
| `journal` | `writing_journal` | no | note (a page, rarely shared) |
| `cards` | `playing_cards` | yes | — |
| `training` | `working_out`, `stretching` | yes | — |
| `mending` | `mending_clothes` | yes | prop |
| `weapons_care` | `cleaning_weapon` | yes (a privilege) | — |
| `poetry` | `writing_journal` | no | note (a poem) |
| `stargazing` | the roof at night | yes | — |
| `languages` | `reading_book` | yes | note |
| `puzzles` | `idle` | yes | — |
| `collecting` | after runs | no | prop (a shelf of finds) |
| `dancing` | `music` | yes | — |
| `hair_and_makeup` | `doing_hair` | yes | — |
| `games_on_pda` | `chatting_on_pda` | no | — |
| `animals` | the perimeter (a stray, a bird) | no | prop |

## 4. Pastimes (`pastimes`, quiet meetings)

| id | place (affordances / location) | her activity | the commander's | slot |
|---|---|---|---|---|
| `cook_together` | `mess_hall` | `eating` (cooking) | helping | evening |
| `rain_on_the_roof` | `roof`, weather rain | `idle` | `idle` | any |
| `fix_gear` | `workshop` | `repairing_gear` | `holding_for_her` | morning, afternoon |
| `cards` | `mess_hall`, her quarters | `playing_cards` | playing | evening, night |
| `music` | her quarters, `roof` | `music` | listening | evening |
| `perimeter_walk` | `perimeter` | walking | walking | afternoon, evening |
| `read_together` | her quarters, `medbay` | `reading_book` | `reading_aloud` or reading | any |
| `train_together` | `training_yard` | `working_out` | training | morning, afternoon |
| `tea_at_night` | `mess_hall`, her quarters | `drinking` | `drinking` | night |
| `her_hobby` | by the hobby | the hobby's activity | learning | by the hobby |
