# Substrat — guide d'utilisation

## Installation

```bash
pip install -e ".[re]"
```

Cela installe la commande `substrat` et la dependance `dpkt` pour l'analyse pcap.

Verifier l'installation :

```bash
substrat info
```

## Commandes

### `substrat learn` — decouvrir la grammaire d'un fichier

```bash
substrat learn data.txt
```

Prend un fichier texte (une ligne = un echantillon), decouvre automatiquement
la grammaire minimale sous pression MDL.

Sortie : strategie, productions, bpc, parse failures.

```
Corpus: 100 lines, alphabet=6 chars
Strategy: wrap
Grammar (3 productions):
  S->(S)
  S->()
  S->SS
bpc: 1.6030
Parse failures: 0/34
CPU: 0.04s
```

### `substrat compress` — mesurer la compression

```bash
substrat compress data.txt
```

Apprend la grammaire sur les 2/3 du fichier, mesure la compression sur le dernier tiers.

```
Raw: 2720 bits (340 chars x 8)
Compressed: 545 bits (1.6030 bpc)
Ratio: 20.0%
```

### `substrat anomaly` — detecter les anomalies

```bash
# Entrainement + test sur le meme fichier (split 2/3 - 1/3)
substrat anomaly data.txt

# Entrainement et test separes
substrat anomaly test.txt --train train.txt
```

Double scoring : structurel (la ligne parse-t-elle ?) et statistique (NLL z-score).

```
Grammar: 3 productions
NLL baseline: mean=1.234 std=0.567
Threshold: 2.651

  STRUCT: malformed_line_here
  STAT (z=3.2): unusual_but_valid_line

1 structural + 1 statistical = 2/34 anomalies
```

### `substrat generate` — generer des donnees depuis la grammaire

```bash
substrat generate data.txt --n 20
```

Apprend la grammaire puis genere N echantillons valides avec profondeur controlee.

### `substrat re` — reverse-engineer un protocole depuis un pcap

C'est la commande principale pour le pentest et le forensics.

```bash
# Analyse basique : grammaire + anomalies
substrat re capture.pcap

# Avec generation de corpus de fuzz (500 samples par defaut)
substrat re capture.pcap --fuzz ./fuzz_output

# Avec export Wireshark .lua dissector
substrat re capture.pcap --wireshark ./dissectors

# Les 3 ensemble
substrat re capture.pcap --fuzz ./fuzz --wireshark ./dissectors --fuzz-count 1000
```

#### Ce que fait `substrat re`

1. **Lit le pcap** (pcap ou pcapng, TCP/UDP/ICMP, IPv4/IPv6)
2. **Groupe les paquets** par flux ou par service (auto-selection du meilleur groupement)
3. **Detecte le mode** pour chaque flux :
   - **Texte** (HTTP, FTP, SMTP...) : dispatch vers l'auto-lexer (tokens, template positionnel)
   - **Binaire** (DNS, MODBUS, protocoles proprietaires...) : binary lexer (magic bytes, champs de longueur, types, zones variables)
   - **Mixte** (Telnet...) : split automatique binaire/texte dans le meme flux
4. **Produit la grammaire** du protocole
5. **Detecte les anomalies** (magic bytes corrompus, types inconnus, paquets tronques)
6. **Genere un corpus de fuzz** (3 strategies : field_flip, boundary, structural)
7. **Exporte un dissector Wireshark** (.lua) pour chaque flux binaire

#### Sortie typique (MODBUS/TCP)

```
Pcap: 85 packets, 1 services (1 analyzable)

--- Flow: TCP|192.168.1.10:502 (85 packets, BINARY mode) ---
Coverage: 94%

Protocol grammar discovered:
  MSG -> MAGIC_0 DATA_1 FIXED_2 TYPE_3 DATA_4 FIXED_5 DATA_6
  MAGIC_0 -> 0x00
  DATA_1 -> <bytes[1]>
  FIXED_2 -> 0x00000006
  TYPE_3 -> 0x01 | 0x02 | 0x03
  DATA_4 -> <bytes[1]>
  FIXED_5 -> 0x00
  DATA_6 -> <bytes[3]>

Anomalies found: 5/85 packets
  #80: 00640001000601ffdeadbeef...
    - FIXED_2 mismatch: expected 0x00000006, got 0x00010006
    - FIXED_5 mismatch: expected 0x00, got 0xde

Wireshark dissector: ./dissectors/TCP_192.168.1.10_502.lua
Fuzz corpus: 500 samples -> ./fuzz/TCP_192.168.1.10_502/

Total CPU: 0.03s
```

#### Installer le dissector Wireshark

```bash
# macOS
cp ./dissectors/*.lua ~/.config/wireshark/plugins/

# Linux
cp ./dissectors/*.lua ~/.local/lib/wireshark/plugins/

# Windows
copy dissectors\*.lua %APPDATA%\Wireshark\plugins\
```

Puis dans Wireshark : `Ctrl+Shift+L` pour recharger les plugins, ou redemarrer.

Le dissector se registre automatiquement sur le port decouvert (502 pour MODBUS,
53 pour DNS, etc.). Pour les protocoles sans port connu, utiliser
"Decode As..." dans Wireshark.

#### Ce que le dissector fait dans Wireshark

- Nomme chaque champ dans le **Packet Detail pane** (MAGIC, TYPE, DATA, FIXED...)
- Affiche les valeurs en hex/decimal selon le type
- Marque les **anomalies** dans Expert Info (triangle jaune) :
  - Magic bytes corrompus
  - Champs fixes modifies
  - Valeurs de type inconnues

#### Utiliser le corpus de fuzz

Les fichiers `.bin` dans le repertoire de fuzz sont des paquets binaires
bruts, prets a etre envoyes sur le reseau :

```bash
# Avec ncat
for f in ./fuzz/TCP_192.168.1.10_502/*.bin; do
  ncat 192.168.1.10 502 < "$f"
done

# Avec scapy (Python)
from scapy.all import *
for f in sorted(glob("./fuzz/**/*.bin")):
    data = open(f, "rb").read()
    send(IP(dst="192.168.1.10")/TCP(dport=502)/Raw(data))
```

## Protocoles testes

| Protocole | Type | Resultat |
|-----------|------|----------|
| DNS | Binaire (reel) | Transaction ID, Flags, Questions, Authority detectes |
| Telnet | Mixte (reel) | Split auto IAC binary + text commands |
| FTP | Texte (reel) | Token `\r\n`, commandes FTP, 0 parse failure |
| MODBUS/TCP | Binaire (SCADA) | Proto ID, Unit ID, Length. 5/5 anomalies detectees |
| HTTP | Texte | Tokens HTTP, GET, api. Requetes/reponses separees |
| DHCP | Binaire (reel) | 4 paquets (skip, trop petit pour analyse) |

## Formats texte testes (hors pcap)

| Format | bpc | n-gram n=3 | gzip | Gain vs n-gram |
|--------|-----|-----------|------|----------------|
| JSON | 0.73 | 1.09 | 0.95 | -33% |
| MQTT | 0.50 | 0.85 | 1.32 | -41% |
| CSV | 0.63 | 1.71 | 2.11 | -63% |
| syslog | 1.27 | 1.75 | 1.85 | -28% |
| HTTP | 0.88 | 1.05 | 1.15 | -16% |

## Tests

```bash
python3 test_all.py           # 80 tests core (29s)
python3 test_protocol_re.py   # 16 tests protocol RE + Wireshark
```
