# Ograniczenia audytu

## Niedostępne narzędzia (nie instalowano – zgodnie ze zleceniem)

| Narzędzie | Stan | Skutek |
| --- | --- | --- |
| ScanOSS (scanoss-py) | brak; wymaga też wysłania odcisków kodu do usługi – bez zgody | brak automatycznego porównania z bazą kodu open source |
| ScanCode Toolkit | brak | brak automatycznego wykrywania licencji i not; zastąpione przeszukaniem tekstu |
| FOSSology | brak | jw. |
| GitHub Code Search | nieużyty: wymagałby wysłania fragmentów kodu; serwer MCP GitHub też się nie połączył | brak wyszukiwania kopii fragmentów w GitHub |
| Generatory SBOM (cyclonedx-npm, syft) | brak | SBOM (`sbom.cdx.json`) przygotowany ręcznie na podstawie inwentaryzacji |

## Niedostępne źródła (polityka sieci środowiska)

- Google Patents, Espacenet, USPTO (ppubs, Patent Center), Justia, strona autora PNPOLY i inne: połączenie odrzucone
  (tunel CONNECT 403) albo błąd DNS w narzędziu pobierania stron. Działała tylko wyszukiwarka internetowa: wszystkie
  dane patentowe pochodzą z jej wyników (cytujących Google Patents, Justia i prasę) i są **niezweryfikowane** w bazach.
- Nie odczytano treści zastrzeżeń żadnego patentu. Nie sprawdzono statusów w rejestrach (USPTO, EPO Register, UPRP).
- Bazy Urzędu Patentowego RP nie przeszukano.
- Dostęp przywraca zmiana ustawień sieci środowiska (Network access) – np. dopuszczenie domen
  patents.google.com, worldwide.espacenet.com, ppubs.uspto.gov, register.epo.org, uprp.gov.pl.

## Zakres niesprawdzony albo sprawdzony częściowo

- **Ikony** (`js/ui/icons.js`, 305 wierszy ścieżek SVG): nie porównano z zestawami ikon (SF Symbols, Material Icons,
  Feather, Lucide). Plik deklaruje ikony własne. Proste piktogramy (dom, książka, strzałki) bywają podobne
  z natury rzeczy.
- **Teksty** (dane przykładowe, podpowiedzi, opisy): nie sprawdzono, czy definicje pojęć nie są przepisane ze
  słowników lub glosariuszy.
- **Pełny przegląd 53 tys. wierszy kodu aplikacji:** ręcznie przejrzano moduły CAD i algorytmy (rejestr 48 pozycji).
  Resztę sprawdzono wyszukiwaniem wzorców (noty, licencje, nazwy bibliotek, adresy), nie wiersz po wierszu.
- **Hipoteza S-3** (próg SLERP z przykładu w Wikipedii) – z pamięci audytora, niezweryfikowana.
- **Licencja PNPOLY** – z kopii w źródłach osób trzecich, nie ze strony autora.
- **Funkcje z opisu zlecenia, których nie ma w kodzie:** synchronizacja iCloud (jest tylko podpowiedź zapisu pliku
  w „Plikach”), grywalizacja i osiągnięcia. Nie oceniano ich.
- **Historia git:** przejrzano tylko metadane (liczba commitów, dopiski współautorstwa). Usuniętych plików w historii
  nie sprawdzano pod kątem kodu osób trzecich.
- **Dystrybucja w sklepach:** ocena dotyczy kodu w repozytorium. Pakowanie (np. Capacitor, Electron) dodałoby
  zależności, których dziś nie ma.

## Charakter wniosków

To ocena techniczna i wstępna ocena ryzyka, nie opinia prawna ani analiza Freedom to Operate. Brak trafień nie
gwarantuje braku naruszeń. Podobieństwo nie oznacza naruszenia. Kwestie patentowe (P-01, P-03, P-07) wymagają
rzecznika patentowego.
