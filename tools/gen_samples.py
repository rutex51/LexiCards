# -*- coding: utf-8 -*-
"""Jedno źródło danych przykładowych LexiCards.

Generuje trzy pliki o tej samej zawartości:
  - js/core/sample-data.js               (dane wbudowane w aplikację)
  - docs/samples/lexicards_sample.csv    (do testów importu)
  - docs/samples/lexicards_sample.xlsx   (do testów importu)

Użycie (z katalogu głównego repozytorium; wymaga pakietu openpyxl):
    python3 tools/gen_samples.py .
"""
import csv, sys, os
from openpyxl import Workbook
from openpyxl.styles import Font

ROOT = sys.argv[1]

def T(pl, en, dpl=None, den=None, epl=None, een=None, tags=()):
    return dict(pl=pl, en=en, dpl=dpl, den=den, epl=epl, een=een, tags=list(tags))

DATA = [
 dict(name="Business English", details="Słownictwo biznesowe: zarządzanie, finanse i negocjacje.", icon="💼", color="gray", modules=[
  dict(name="Management", lessons=[
   dict(name="Leadership", terms=[
    T("przywództwo","leadership",
      "Zdolność wpływania na ludzi i kierowania nimi tak, aby osiągali wspólne cele.",
      "The ability to influence and guide people so that they achieve shared goals.",
      "Dobre przywództwo zwiększa zaangażowanie zespołu.",
      "Good leadership increases team engagement.", ["zarządzanie"]),
    T("delegowanie zadań","delegation",
      "Przekazywanie zadań i odpowiedzialności członkom zespołu.",
      "Assigning tasks and responsibility to team members.",
      "Skuteczne delegowanie zadań pozwala kierownikowi skupić się na strategii.",
      "Effective delegation lets a manager focus on strategy.", ["zarządzanie"]),
    T("interesariusz","stakeholder",
      "Osoba lub grupa, na którą wpływa działalność organizacji albo która może na nią wpływać.",
      "A person or group that is affected by an organisation's activities or can affect them.",
      "Przed rozpoczęciem projektu zidentyfikowaliśmy kluczowych interesariuszy.",
      "We identified the key stakeholders before starting the project.", ["zarządzanie","projekty"]),
    T("informacja zwrotna","feedback",
      "Ocena lub komentarz dotyczący czyjejś pracy, przekazywany w celu jej poprawy.",
      "An evaluation of or comment on someone's work, given in order to improve it.",
      "Regularna informacja zwrotna pomaga pracownikom się rozwijać.",
      "Regular feedback helps employees develop.", ["zarządzanie","komunikacja"]),
   ]),
   dict(name="Strategic Planning", lessons_terms=None, terms=[
    T("cel strategiczny","strategic objective",
      "Długoterminowy, mierzalny rezultat, który organizacja zamierza osiągnąć.",
      "A long-term, measurable result that an organisation intends to achieve.",
      "Naszym celem strategicznym jest wejście na trzy nowe rynki.",
      "Our strategic objective is to enter three new markets.", ["strategia"]),
    T("analiza SWOT","SWOT analysis",
      "Ocena mocnych i słabych stron organizacji oraz szans i zagrożeń w jej otoczeniu.",
      "An assessment of an organisation's strengths and weaknesses and of the opportunities and threats it faces.",
      "Analiza SWOT wykazała, że największym zagrożeniem jest nowa konkurencja.",
      "The SWOT analysis showed that new competition is the biggest threat.", ["strategia"]),
    T("przewaga konkurencyjna","competitive advantage",
      "Cecha, dzięki której firma osiąga lepsze wyniki niż jej konkurenci.",
      "A feature that allows a company to outperform its competitors.",
      "Szybka dostawa jest naszą główną przewagą konkurencyjną.",
      "Fast delivery is our main competitive advantage.", ["strategia"]),
   ]),
   dict(name="Decision Making", terms=[
    T("ocena ryzyka","risk assessment",
      "Identyfikacja zagrożeń oraz oszacowanie ich prawdopodobieństwa i skutków.",
      "Identifying hazards and estimating their likelihood and impact.",
      "Ocena ryzyka jest obowiązkowa przed zatwierdzeniem inwestycji.",
      "A risk assessment is mandatory before the investment is approved.", ["decyzje"]),
    T("analiza kosztów i korzyści","cost-benefit analysis",
      "Porównanie przewidywanych kosztów działania z oczekiwanymi korzyściami.",
      "A comparison of the expected costs of an action with its expected benefits.",
      "Analiza kosztów i korzyści przemawia za automatyzacją linii.",
      "The cost-benefit analysis supports automating the line.", ["decyzje","finanse"]),
    T("kompromis","trade-off",
      "Sytuacja, w której poprawa jednego parametru oznacza pogorszenie innego.",
      "A situation in which improving one factor means accepting a loss in another.",
      "Istnieje kompromis między szybkością a dokładnością.",
      "There is a trade-off between speed and accuracy.", ["decyzje"]),
   ]),
  ]),
  dict(name="Finance", lessons=[
   dict(name="Financial Statements", terms=[
    T("bilans","balance sheet",
      "Zestawienie aktywów, zobowiązań i kapitału własnego firmy na określony dzień.",
      "A statement of a company's assets, liabilities and equity at a specific date.",
      "Bilans pokazuje, że zadłużenie spółki spadło.",
      "The balance sheet shows that the company's debt has decreased.", ["finanse","sprawozdania"]),
    T("rachunek zysków i strat","income statement",
      "Sprawozdanie przedstawiające przychody, koszty i wynik finansowy za dany okres.",
      "A report showing revenues, expenses and profit or loss for a given period.",
      "Rachunek zysków i strat wykazał zysk netto za trzeci kwartał.",
      "The income statement showed a net profit for the third quarter.", ["finanse","sprawozdania"]),
    T("przepływy pieniężne","cash flow",
      "Wpływy i wydatki środków pieniężnych firmy w danym okresie.",
      "The money flowing into and out of a company during a given period.",
      "Dodatnie przepływy pieniężne pozwoliły spłacić kredyt.",
      "Positive cash flow made it possible to repay the loan.", ["finanse","sprawozdania"]),
    T("aktywa","assets",
      "Zasoby kontrolowane przez firmę, które mają przynieść jej korzyści ekonomiczne.",
      "Resources controlled by a company that are expected to bring economic benefits.",
      "Aktywa trwałe obejmują budynki i maszyny.",
      "Fixed assets include buildings and machinery.", ["finanse"]),
   ]),
   dict(name="Investments", terms=[
    T("stopa zwrotu","rate of return",
      "Zysk lub strata z inwestycji wyrażona jako procent zainwestowanej kwoty.",
      "The gain or loss on an investment expressed as a percentage of the amount invested.",
      "Roczna stopa zwrotu z funduszu wyniosła sześć procent.",
      "The fund's annual rate of return was six percent.", ["finanse","inwestycje"]),
    T("dywersyfikacja","diversification",
      "Rozłożenie inwestycji na różne aktywa w celu ograniczenia ryzyka.",
      "Spreading investments across different assets in order to reduce risk.",
      "Dywersyfikacja portfela zmniejsza wpływ pojedynczej straty.",
      "Portfolio diversification reduces the impact of a single loss.", ["finanse","inwestycje"]),
   ]),
   dict(name="Financial Ratios", terms=[
    T("wskaźnik płynności bieżącej","current ratio",
      "Iloraz aktywów obrotowych i zobowiązań krótkoterminowych.",
      "Current assets divided by current liabilities.",
      "Wskaźnik płynności bieżącej poniżej jedności sygnalizuje problemy z regulowaniem zobowiązań.",
      "A current ratio below one signals difficulty in meeting short-term obligations.", ["finanse","wskaźniki"]),
    T("marża zysku netto","net profit margin",
      "Zysk netto wyrażony jako procent przychodów.",
      "Net profit expressed as a percentage of revenue.",
      "Marża zysku netto wzrosła z ośmiu do dziesięciu procent.",
      "The net profit margin rose from eight to ten percent.", ["finanse","wskaźniki"]),
   ]),
  ]),
  dict(name="Negotiations", lessons=[
   dict(name="Basic Vocabulary", terms=[
    # Celowo bez opisów – przykład pojęcia z brakującymi danymi.
    T("oferta","offer", None, None,
      "Przedstawili ofertę, której nie mogliśmy odrzucić.",
      "They made an offer we could not refuse.", ["negocjacje"]),
    T("ustępstwo","concession",
      "Rezygnacja z części własnych żądań w celu osiągnięcia porozumienia.",
      "Giving up part of one's demands in order to reach an agreement.",
      "Obie strony musiały pójść na ustępstwa.",
      "Both sides had to make concessions.", ["negocjacje"]),
   ]),
   dict(name="Negotiation Techniques", terms=[
    T("najlepsza alternatywa dla negocjowanego porozumienia (BATNA)","best alternative to a negotiated agreement (BATNA)",
      "Najlepsze rozwiązanie dostępne dla strony, jeżeli negocjacje zakończą się niepowodzeniem.",
      "The best option available to a party if the negotiation fails.",
      "Znajomość własnej BATNA wzmacnia pozycję negocjacyjną.",
      "Knowing your BATNA strengthens your negotiating position.", ["negocjacje","techniki"]),
    T("kotwiczenie","anchoring",
      "Technika polegająca na podaniu pierwszej propozycji, która staje się punktem odniesienia dla dalszych rozmów.",
      "A technique in which the first proposal becomes the reference point for the rest of the negotiation.",
      "Sprzedawca zastosował kotwiczenie, zaczynając od wysokiej ceny.",
      "The seller used anchoring by starting with a high price.", ["negocjacje","techniki"]),
   ]),
  ]),
 ]),
 dict(name="Metrology", details="Metrologia wielkości geometrycznych: maszyny współrzędnościowe i tolerancje.", icon="📐", color="gray", modules=[
  dict(name="Coordinate Measuring Machines", lessons=[
   dict(name="CMM Components", terms=[
    T("współrzędnościowa maszyna pomiarowa","coordinate measuring machine",
      "Urządzenie wyznaczające współrzędne punktów na powierzchni przedmiotu w celu określenia jego geometrii.",
      "A device that determines the coordinates of points on a workpiece surface in order to establish its geometry.",
      "Detal zmierzono na współrzędnościowej maszynie pomiarowej.",
      "The part was measured on a coordinate measuring machine.", ["CMM"]),
    T("głowica pomiarowa","probe head",
      "Zespół mocujący sondę na pinoli, często umożliwiający jej obrót i pochylenie.",
      "The unit that holds the probe on the ram, often allowing it to rotate and tilt.",
      "Głowica pomiarowa obraca sondę co 7,5 stopnia.",
      "The probe head indexes the probe in 7.5-degree steps.", ["CMM"]),
    T("stół pomiarowy","measuring table",
      "Płyta, najczęściej granitowa, na której mocuje się mierzony przedmiot.",
      "A plate, usually made of granite, on which the workpiece is fixed.",
      "Przedmiot zamocowano na stole pomiarowym.",
      "The workpiece was clamped to the measuring table.", ["CMM"]),
    # Celowo bez przykładu – przykład pojęcia z brakującymi danymi.
    T("portal maszyny","bridge",
      "Ruchoma konstrukcja nośna przesuwająca się nad stołem pomiarowym.",
      "The moving supporting structure that travels over the measuring table.",
      None, None, ["CMM"]),
   ]),
   dict(name="Measurement Accuracy", terms=[
    T("niepewność pomiaru","measurement uncertainty",
      "Parametr charakteryzujący rozrzut wartości, które można przypisać wielkości mierzonej.",
      "A parameter characterising the dispersion of the values that can be attributed to the measurand.",
      "Wynik podano wraz z niepewnością pomiaru.",
      "The result was reported together with its measurement uncertainty.", ["dokładność"]),
    T("błąd graniczny dopuszczalny","maximum permissible error",
      "Największa wartość błędu pomiaru dopuszczona przez specyfikację przyrządu.",
      "The largest measurement error allowed by the specification of an instrument.",
      "Błąd graniczny dopuszczalny maszyny podano w jej specyfikacji.",
      "The maximum permissible error of the machine is stated in its specification.", ["dokładność"]),
    T("powtarzalność","repeatability",
      "Zgodność wyników kolejnych pomiarów tej samej wielkości wykonanych w tych samych warunkach.",
      "The closeness of agreement between successive measurements of the same quantity made under the same conditions.",
      "Powtarzalność sprawdzono na podstawie dziesięciu pomiarów.",
      "Repeatability was checked on the basis of ten measurements.", ["dokładność"]),
    T("wzorcowanie","calibration",
      "Ustalenie zależności między wskazaniami przyrządu a wartościami wzorca.",
      "Establishing the relationship between the indications of an instrument and the values of a reference standard.",
      "Wzorcowanie maszyny wykonuje się raz w roku.",
      "The machine is calibrated once a year.", ["dokładność"]),
   ]),
   dict(name="Probe Systems", terms=[
    T("sonda stykowa impulsowa","touch-trigger probe",
      "Sonda generująca sygnał w chwili zetknięcia końcówki z powierzchnią przedmiotu.",
      "A probe that generates a signal at the moment its tip touches the workpiece surface.",
      "Sonda stykowa impulsowa rejestruje pojedyncze punkty.",
      "A touch-trigger probe records individual points.", ["sondy"]),
    T("sonda skanująca","scanning probe",
      "Sonda zbierająca punkty w sposób ciągły podczas przesuwania końcówki po powierzchni.",
      "A probe that collects points continuously while its tip moves along the surface.",
      "Sonda skanująca pozwala ocenić kształt całego otworu.",
      "A scanning probe makes it possible to evaluate the form of the whole bore.", ["sondy"]),
    T("trzpień pomiarowy","stylus",
      "Element sondy zakończony kulką, który styka się z mierzonym przedmiotem.",
      "The part of a probe, ending in a ball tip, that makes contact with the workpiece.",
      "Do pomiaru głębokiego otworu użyto dłuższego trzpienia pomiarowego.",
      "A longer stylus was used to measure the deep bore.", ["sondy"]),
   ]),
  ]),
  dict(name="Geometrical Tolerancing", lessons=[
   dict(name="Form Tolerances", terms=[
    T("tolerancja płaskości","flatness tolerance",
      "Dopuszczalna odchyłka powierzchni od idealnej płaszczyzny.",
      "The permissible deviation of a surface from an ideal plane.",
      "Tolerancja płaskości podstawy wynosi 0,05 mm.",
      "The flatness tolerance of the base is 0.05 mm.", ["GD&T","kształt"]),
    T("tolerancja prostoliniowości","straightness tolerance",
      "Dopuszczalna odchyłka linii od idealnej prostej.",
      "The permissible deviation of a line from an ideal straight line.",
      "Na rysunku podano tolerancję prostoliniowości osi wałka.",
      "The drawing specifies a straightness tolerance for the shaft axis.", ["GD&T","kształt"]),
    T("tolerancja okrągłości","roundness tolerance",
      "Dopuszczalna odchyłka zarysu przekroju od idealnego okręgu.",
      "The permissible deviation of a cross-section profile from an ideal circle.",
      "Tolerancję okrągłości sprawdzono w trzech przekrojach.",
      "The roundness tolerance was checked in three cross-sections.", ["GD&T","kształt"]),
    T("tolerancja walcowości","cylindricity tolerance",
      "Dopuszczalna odchyłka powierzchni od idealnego walca.",
      "The permissible deviation of a surface from an ideal cylinder.",
      "Tolerancja walcowości tulei jest bardzo wąska.",
      "The cylindricity tolerance of the sleeve is very tight.", ["GD&T","kształt"]),
   ]),
   dict(name="Position Tolerances", terms=[
    T("tolerancja pozycji","position tolerance",
      "Dopuszczalne odchylenie położenia elementu od położenia teoretycznie dokładnego.",
      "The permissible deviation of a feature's location from its theoretically exact location.",
      "Tolerancja pozycji otworów jest odniesiona do baz A i B.",
      "The position tolerance of the holes is referenced to datums A and B.", ["GD&T","położenie"]),
    T("tolerancja współosiowości","coaxiality tolerance",
      "Dopuszczalne odchylenie osi elementu od osi bazowej.",
      "The permissible deviation of a feature's axis from the datum axis.",
      "Tolerancja współosiowości obu czopów wynosi 0,02 mm.",
      "The coaxiality tolerance of the two journals is 0.02 mm.", ["GD&T","położenie"]),
    T("baza","datum",
      "Teoretycznie dokładny element geometryczny, względem którego określa się tolerancje.",
      "A theoretically exact geometric feature to which tolerances are referenced.",
      "Bazę A stanowi dolna płaszczyzna korpusu.",
      "Datum A is the bottom plane of the housing.", ["GD&T","położenie"]),
   ]),
  ]),
 ]),
]

import json

rows = []
tree = []
total = 0
for d in DATA:
    domain = {"name": d["name"], "details": d["details"], "icon": d["icon"], "color": d["color"], "modules": []}
    for m in d["modules"]:
        module = {"name": m["name"], "lessons": []}
        for l in m["lessons"]:
            lesson = {"name": l["name"], "terms": []}
            for t in l["terms"]:
                total += 1
                rows.append([d["name"], m["name"], l["name"], t["pl"], t["en"], t["dpl"] or "", t["den"] or "", t["epl"] or "", t["een"] or "", ", ".join(t["tags"])])
                lesson["terms"].append({
                    "termPL": t["pl"], "termEN": t["en"],
                    "descriptionPL": t["dpl"] or "", "descriptionEN": t["den"] or "",
                    "examplePL": t["epl"] or "", "exampleEN": t["een"] or "",
                    "tags": t["tags"],
                })
            module["lessons"].append(lesson)
        domain["modules"].append(module)
    tree.append(domain)

js = []
js.append("// Plik wygenerowany przez tools/gen_samples.py – nie edytuj go ręcznie.")
js.append("// Ten sam skrypt tworzy docs/samples/lexicards_sample.csv i .xlsx, dzięki czemu")
js.append("// dane wbudowane w aplikację i pliki do testów importu są zawsze identyczne.")
js.append("")
js.append("export const SAMPLE_DOMAINS = " + json.dumps(tree, ensure_ascii=False, indent=2) + ";")
js.append("")
open(os.path.join(ROOT, "js/core/sample-data.js"), "w", encoding="utf-8").write("\n".join(js))

header = ["Domain", "Module", "Lesson", "Term PL", "Term EN", "Description PL", "Description EN", "Example PL", "Example EN", "Tags"]
csv_path = os.path.join(ROOT, "docs/samples/lexicards_sample.csv")
with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f, delimiter=";", quoting=csv.QUOTE_MINIMAL)
    w.writerow(header)
    w.writerows(rows)

wb = Workbook()
ws = wb.active
ws.title = "Glossary"
ws.append(header)
for c in ws[1]:
    c.font = Font(bold=True)
for r in rows:
    ws.append(r)
widths = [20, 30, 26, 38, 38, 60, 60, 60, 60, 24]
for i, wdt in enumerate(widths):
    ws.column_dimensions[chr(ord("A") + i)].width = wdt
ws.freeze_panes = "A2"
wb.save(os.path.join(ROOT, "docs/samples/lexicards_sample.xlsx"))

print("terms:", total)
per = {}
for r in rows:
    per[r[0]] = per.get(r[0], 0) + 1
print(per)
missing = [(r[3]) for r in rows if not r[5] or not r[7]]
print("z brakującymi danymi:", missing)
