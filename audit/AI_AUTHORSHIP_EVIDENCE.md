# Pochodzenie kodu i wkład twórczy człowieka

Ocena dowodów dostępnych w repozytorium. Nie jest opinią prawną. Ze względu na zasadę „bez danych osobowych
w repozytorium” dokument nie zawiera imion, nazwisk ani adresów – osoba prowadząca projekt to „właściciel produktu”.

## Kontekst prawny (w skrócie, do weryfikacji przez prawnika)

- Prawo polskie (ustawa o prawie autorskim, art. 1 i 74) i prawo UE (dyrektywa 2009/24/WE, orzecznictwo TSUE, np. C-5/08
  Infopaq) chronią utwór będący przejawem własnej twórczości intelektualnej **człowieka**.
- Treść wygenerowana samodzielnie przez system AI co do zasady nie jest utworem. Ochrona może obejmować elementy, w których
  człowiek dokonał twórczych wyborów – w kodzie, w strukturze lub w wyborze i układzie.
- Szczegółowe polecenia (prompty) same w sobie nie przesądzają o autorstwie całego wygenerowanego kodu.
- Niezależnie od ochrony autorskiej: znaki towarowe, nazwa, wygląd interfejsu (wzory przemysłowe), tajemnica
  przedsiębiorstwa i umowy (licencje) są osobnymi podstawami ochrony.

## Dowody w repozytorium

| Dowód | Co pokazuje | Gdzie |
| --- | --- | --- |
| Historia git: 102 commity (2026-10-11 – 2026-10-25), jeden autor-człowiek, wszystkie z dopiskiem `Co-Authored-By: Claude` | kod tworzony przy udziale AI; wpis autora nie przesądza o autorstwie twórczym | `git log` |
| Opisy wydań `docs/RELEASE-*.md` (48 plików) i `docs/STAGE-1..6.md` | decyzje właściciela: zakres, kolejność etapów, odrzucone i zaakceptowane propozycje, np. „zgodnie z propozycją i makietami”, wybór wariantu C okien, „Twoje nagranie” kartki | `docs/` |
| `docs/ARCHITECTURE.md` | architektura i model danych – wynik iteracji właściciela z AI | `docs/ARCHITECTURE.md` |
| Zasoby własne właściciela | nagranie dźwięku kartki (zasób utworzony przez człowieka) | `sounds/kartka.wav`, `docs/RELEASE-1.31.md:47` |
| Dane przykładowe i treść merytoryczna (dziedziny, pojęcia) | wybór dziedzin i zakresu według właściciela; teksty prawdopodobnie generowane | `js/core/sample-data.js`, `tools/gen_samples.py` |
| Kod | według historii w całości współtworzony przez AI; brak w repozytorium commitów oznaczonych jako ręczne zmiany człowieka | — |

## Rozróżnienie (stan wiedzy)

| Kategoria | Przykłady | Uwagi |
| --- | --- | --- |
| Ekspresja człowieka | koncepcja produktu, wymagania funkcjonalne, decyzje UX, akceptacje makiet, nagranie kartki, wybór treści | udokumentowane częściowo (opisy wydań); pełne polecenia są poza repozytorium |
| Implementacja wygenerowana przez AI | moduły JS, CSS, testy, narzędzia | 102/102 commitów z dopiskiem AI |
| AI zmodyfikowane przez człowieka | brak wyodrębnionych dowodów | — |
| Rozwiązania standardowe | algorytmy geometrii z literatury (GEOMETRY_ALGORITHM_REGISTER.csv) | niechronione jako idee |
| Kod osób trzecich | adaptacja py-fsrs (MIT) | THIRD_PARTY_NOTICES.md |

## Zalecenia dokumentacyjne (na przyszłą ocenę praw)

1. Zachować poza publicznym repozytorium **zapisy rozmów z asystentem AI** (polecenia, propozycje, decyzje, akceptacje
   makiet), z datami. Najmocniej dokumentują wkład twórczy człowieka.
2. Prowadzić krótki **dziennik decyzji projektowych** właściciela (co wybrał, co odrzucił, dlaczego). Może być prywatny,
   bez danych osobowych w repozytorium publicznym.
3. Oznaczać w commitach zmiany wprowadzone ręcznie przez człowieka, np. dopiskiem `Human-Edit:`.
4. Zachować prywatnie dowód wykonania nagrania kartki (plik źródłowy, data, urządzenie).
5. Przed sprzedażą rozważyć opinię prawnika co do zakresu praw do kodu i strategię ochrony: znak towarowy nazwy,
   umowa licencyjna EULA, tajemnica przedsiębiorstwa – repozytorium jest dziś publiczne, więc tajemnica nie chroni kodu.
6. Sprawdzić warunki usługi AI użytej do generowania (prawa do wyników, zobowiązania dostawcy) w wersji
   obowiązującej w okresie tworzenia kodu.
