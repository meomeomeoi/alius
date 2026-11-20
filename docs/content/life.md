# Her life — draft content for P14c

> Draft lists from the 2026-11-20 design session. Ids, groups and positions are structure; every `description`, fallback line and position wording is `AUTHOR TO WRITE`. The JSON mirrors this file. Lore §0 applies: the soldiers are "she", the commander never gets a pronoun.

## 1. Opinion topics (`opinionTopics`)

Positions are ids (2–4 per topic); `axis` suggests a default position from the P8 values axes when the card says nothing.

### 1.1 Lore

| id | positions | axis |
|---|---|---|
| `corporations` | `necessary`, `tolerated`, `hated` | corporate |
| `own_corporation` | `loyal`, `indifferent`, `bitter` | corporate |
| `the_bloom` | `plague`, `nature`, `resource`, `punishment` | — |
| `being_construct` | `a_person`, `a_tool`, `unsure` | autonomy |
| `the_vat` | `does_not_remember`, `misses_it`, `nightmare` | — |
| `the_leash` | `fair_price`, `humiliation`, `safety` | autonomy |
| `ccp_program` | `second_chance`, `dumping_ground`, `prison` | — |
| `convicts_in_command` | `deserve_it`, `pity`, `contempt` | — |
| `oversight` | `trusts_it`, `fears_it`, `mocks_it` | corporate |
| `mutants` | `just_targets`, `were_people`, `pity` | mercy |
| `off_spec` | `defect_is_shame`, `defect_is_self`, `doesnt_care` | — |
| `cities_outside` | `wants_to_see`, `glad_to_be_away`, `never_think_of_it` | — |
| `aurum_debt` | `everyone_owes`, `scam`, `doesnt_know` | — |
| `sable_line` | `respects_them`, `mercenaries`, `rivals` | — |

### 1.2 Service

| id | positions | axis |
|---|---|---|
| `orders` | `obeys`, `questions`, `depends_who` | autonomy |
| `duty` | `everything`, `a_job`, `a_lie` | sacrifice |
| `fear_in_combat` | `normal`, `shameful`, `never_felt` | — |
| `heroism` | `stupid`, `admirable`, `rare` | sacrifice |
| `cowardice` | `forgivable`, `unforgivable` | ingroup |
| `death_in_battle` | `good_end`, `waste`, `just_happens` | sacrifice |
| `killing` | `job`, `weighs_on_her`, `enjoys_it` | mercy |
| `weapons` | `tools`, `loves_hers`, `hates_them` | — |
| `leaving_someone_behind` | `never`, `if_needed`, `depends` | ingroup |
| `rank` | `matters`, `empty`, `earned_only` | — |
| `the_squad` | `family`, `coworkers`, `burden` | ingroup |

### 1.3 Everyday

| id | positions | axis |
|---|---|---|
| `food` | `fuel`, `pleasure`, `picky` | — |
| `ration_bars` | `fine`, `disgusting`, `nostalgic` | — |
| `coffee` | `lives_on_it`, `hates_it`, `tea_instead` | — |
| `music` | `needs_it`, `background`, `silence_better` | — |
| `books` | `reads_everything`, `pointless`, `only_manuals` | — |
| `sleep` | `light_sleeper`, `sleeps_anywhere`, `insomniac` | — |
| `mornings` | `early`, `hates_mornings` | — |
| `weather_rain` | `loves_rain`, `hates_rain` | — |
| `cleanliness` | `fastidious`, `practical`, `careless` | — |
| `the_base` | `home`, `barracks`, `cage` | — |
| `animals` | `loves_them`, `food`, `afraid` | — |
| `alcohol` | `drinks`, `never`, `socially` | — |
| `smoking` | `smokes`, `hates_smoke`, `quit` | — |
| `clothes` | `uniform_only`, `likes_to_dress`, `doesnt_care` | — |
| `gambling` | `loves_it`, `stupid`, `only_for_fun` | — |

### 1.4 People

| id | positions | axis |
|---|---|---|
| `trust` | `easy`, `earned`, `never` | — |
| `friendship` | `needs_it`, `few_friends`, `alone_better` | ingroup |
| `love` | `real`, `weakness`, `chemistry`, `not_for_her` | — |
| `loyalty` | `to_people`, `to_the_squad`, `to_herself` | ingroup |
| `family` | `wants_one`, `the_squad_is_hers`, `never_had_one` | — |
| `grief` | `talks_it_out`, `buries_it`, `rages` | — |
| `loneliness` | `fears_it`, `prefers_it` | — |
| `jealousy` | `natural`, `childish`, `owns_it` | — |
| `lying` | `never`, `when_kind`, `useful` | — |
| `teasing` | `affection`, `cruelty`, `game` | — |
| `strangers` | `curious`, `wary`, `hostile` | — |

### 1.5 Abstract

| id | positions | axis |
|---|---|---|
| `freedom` | `everything`, `illusion`, `overrated` | autonomy |
| `fate` | `written`, `made`, `chance` | — |
| `meaning` | `none`, `in_others`, `in_work`, `searching` | — |
| `faith` | `believes`, `doesnt`, `wants_to` | — |
| `honesty` | `always`, `kindness_first` | — |
| `revenge` | `just`, `poison`, `owed` | mercy |
| `forgiveness` | `easy`, `earned`, `never` | mercy |
| `beauty` | `matters`, `luxury`, `everywhere` | — |
| `time` | `running_out`, `endless`, `doesnt_think` | — |
| `memory` | `treasure`, `burden`, `unreliable` | — |
| `being_human` | `a_choice`, `biology`, `doesnt_matter` | autonomy |
| `the_future` | `hopeful`, `none`, `day_by_day` | — |
| `strength` | `body`, `will`, `others` | — |
| `pain` | `teacher`, `enemy`, `nothing` | — |

That is 65 topics; the author may cut or regroup.

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
