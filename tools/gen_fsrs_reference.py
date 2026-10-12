"""Wektory referencyjne FSRS z oficjalnej implementacji py-fsrs.

Plik tests/fixtures/fsrs-reference.json powstaje z biblioteki py-fsrs
(https://github.com/open-spaced-repetition/py-fsrs). Test jednostkowy
tests/unit/fsrs.test.js odtwarza te same historie powtórek w js/core/fsrs.js
i porównuje wynik krok po kroku.

Użycie (katalog z kodem py-fsrs podajemy jawnie, biblioteka nie jest instalowana):

    python3 -I tools/gen_fsrs_reference.py ŚCIEŻKA_DO_py-fsrs tests/fixtures/fsrs-reference.json
"""

import json
import random as random_module
import sys
from datetime import datetime, timedelta, timezone

source, target = sys.argv[1], sys.argv[2]
sys.path.insert(0, source)

import fsrs  # noqa: E402
import fsrs.scheduler as scheduler_module  # noqa: E402
from fsrs import Card, Rating, Scheduler, State  # noqa: E402

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
STATE_NAMES = {State.Learning: "learning", State.Review: "review", State.Relearning: "relearning"}

# Odstępy między powtórkami: od sekund (ta sama sesja) po miesiące.
GAPS = [
    timedelta(seconds=40),
    timedelta(minutes=3),
    timedelta(minutes=10),
    timedelta(hours=2),
    timedelta(hours=9),
    timedelta(hours=23, minutes=50),
    timedelta(days=1),
    timedelta(days=1, hours=7),
    timedelta(days=3),
    timedelta(days=8),
    timedelta(days=21),
    timedelta(days=75),
    timedelta(days=400),
]

CONFIGS = [
    {
        "name": "domyślny bez rozmycia",
        "options": {"enable_fuzzing": False},
        "js": {"enableFuzzing": False},
    },
    {
        "name": "bez kroków nauki, skuteczność 0.85",
        "options": {"learning_steps": (), "relearning_steps": (), "desired_retention": 0.85, "enable_fuzzing": False},
        "js": {"learningSteps": [], "relearningSteps": [], "desiredRetention": 0.85, "enableFuzzing": False},
    },
    {
        "name": "jeden krok nauki, skuteczność 0.95, odstęp najwyżej 365 dni",
        "options": {
            "learning_steps": (timedelta(minutes=5),),
            "relearning_steps": (timedelta(minutes=10), timedelta(hours=1)),
            "desired_retention": 0.95,
            "maximum_interval": 365,
            "enable_fuzzing": False,
        },
        "js": {
            "learningSteps": [5],
            "relearningSteps": [10, 60],
            "desiredRetention": 0.95,
            "maximumInterval": 365,
            "enableFuzzing": False,
        },
    },
    {
        "name": "domyślny z rozmyciem",
        "options": {},
        "js": {},
    },
]


def millis(moment):
    return (moment - EPOCH) // timedelta(milliseconds=1)


def snapshot(card):
    return {
        "state": STATE_NAMES[card.state],
        "step": card.step,
        "stability": card.stability,
        "difficulty": card.difficulty,
        "due": millis(card.due),
        "lastReview": millis(card.last_review) if card.last_review else None,
    }


def main():
    generator = random_module.Random(20261012)
    consumed = []

    def recorded_random():
        value = generator.random()
        consumed.append(value)
        return value

    # Rozmycie odstępu korzysta z random() modułu scheduler – podmieniamy je na
    # powtarzalne źródło i zapisujemy wartości, żeby test JS podał te same.
    scheduler_module.random = recorded_random

    result = {"pyFsrsVersion": None, "configs": []}
    try:
        from importlib.metadata import version

        result["pyFsrsVersion"] = version("fsrs")
    except Exception:  # biblioteka nie jest zainstalowana – wersję bierzemy z pyproject.toml
        with open(f"{source}/pyproject.toml", encoding="utf-8") as handle:
            for line in handle:
                if line.startswith("version"):
                    result["pyFsrsVersion"] = line.split("=")[1].strip().strip('"')
                    break

    plan = random_module.Random(7)
    start = datetime(2026, 1, 5, 8, 0, tzinfo=timezone.utc)
    for config in CONFIGS:
        scheduler = Scheduler(**config["options"])
        histories = []
        for _ in range(30):
            card = Card(card_id=1, due=start)
            moment = start + timedelta(minutes=plan.randrange(0, 600))
            steps = []
            for _ in range(plan.randrange(4, 16)):
                rating = plan.choices([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy], weights=[2, 2, 5, 1])[0]
                consumed.clear()
                retrievability = scheduler.get_card_retrievability(card, current_datetime=moment)
                card, _log = scheduler.review_card(card, rating, review_datetime=moment)
                steps.append({
                    "at": millis(moment),
                    "rating": int(rating),
                    "retrievability": retrievability,
                    "random": list(consumed),
                    "card": snapshot(card),
                })
                # Następna powtórka: zwykle w terminie, czasem wcześniej albo później.
                if plan.random() < 0.45:
                    moment = card.due + timedelta(minutes=plan.randrange(0, 180))
                else:
                    moment = moment + plan.choice(GAPS)
            histories.append(steps)
        result["configs"].append({"name": config["name"], "options": config["js"], "histories": histories})

    with open(target, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    total = sum(len(history) for config in result["configs"] for history in config["histories"])
    print(f"py-fsrs {result['pyFsrsVersion']}: {total} powtórek w {len(result['configs'])} ustawieniach -> {target}")


main()
