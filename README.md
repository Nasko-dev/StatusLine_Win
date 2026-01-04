# Claude Code Statusline (Windows)

Une statusline personnalisée pour Claude Code sur Windows affichant les informations essentielles en temps réel.

![Statusline Example](https://via.placeholder.com/800x60/1a1a1a/ffffff?text=main*+%2B123+-45+~3+~5+•+/project+•+Opus+4.5)

## Fonctionnalités

```
main* +8833 -1892 ~3 ~5 • /SAS/my-app • Opus 4.5
S: $0.15 66k ⣿⣿⣿⣤⣀⣀⣀⣀⣀⣀ 33% (5m) L: $13.33 ⣿⣶⣀⣀⣀ 32% (2h41m) D: $14.35
```

### Ligne 1 - Contexte
| Element | Description | Couleur |
|---------|-------------|---------|
| `main*` | Branche Git + indicateur dirty | Blanc/Magenta |
| `+8833` | Lignes ajoutées | Vert |
| `-1892` | Lignes supprimées | Rouge |
| `~3` | Fichiers staged | Gris |
| `~5` | Fichiers unstaged | Jaune |
| `/SAS/my-app` | Chemin du projet | Gris |
| `Opus 4.5` | Modèle (caché si Sonnet) | Cyan |

### Ligne 2 - Session
| Element | Description | Couleur |
|---------|-------------|---------|
| `$0.15` | Coût de la session | Vert |
| `66k` | Tokens de contexte | Cyan |
| `⣿⣿⣿⣤⣀⣀⣀⣀⣀⣀` | Barre contexte (33%) | Progressive |
| `(5m)` | Durée de la session | Jaune |
| `L: $13.33` | Coût période 5h | Vert |
| `⣿⣶⣀⣀⣀ 32%` | Utilisation limite 5h | Progressive |
| `(2h41m)` | Reset dans X temps | Cyan |
| `D: $14.35` | Dépense du jour | Vert |

## Installation

### Prérequis

1. **Bun** - Runtime JavaScript rapide
```bash
# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"
```

2. **Git Bash** - Terminal recommandé

### Installation du script

```bash
# Cloner dans le dossier Claude
cd ~/.claude/scripts
git clone <repo-url> statusline

# Installer les dépendances
cd statusline
bun install
```

### Configuration Claude Code

Ajouter dans `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "C:\\Users\\VOTRE_USER\\AppData\\Roaming\\npm\\node_modules\\bun\\bin\\bun.exe C:\\Users\\VOTRE_USER\\.claude\\scripts\\statusline\\src\\statusline-windows.ts",
    "padding": 0
  }
}
```

> **Important**: Remplacer `VOTRE_USER` par votre nom d'utilisateur Windows.

Pour trouver le chemin de bun:
```bash
which bun
# ou
where bun
```

## Commandes

### Dépenses

```bash
# Dépenses du jour
bun run spend:today

# Dépenses du mois
bun run spend:month
```

## Hooks Audio (Optionnel)

Ajouter des sons quand Claude termine ou a besoin d'aide.

### Etape 1: Copier les sons

Les fichiers MP3 d'exemple sont dans le dossier `song/` de ce projet.

**IMPORTANT**: Ils doivent être copiés à la racine de Claude:

```bash
# Créer le dossier
mkdir -p ~/.claude/song

# Copier vos fichiers MP3
cp ~/.claude/scripts/statusline/song/*.mp3 ~/.claude/song/
```

Emplacement final:
```
C:\Users\VOTRE_USER\.claude\song\
├── finish.mp3      # Son quand Claude termine
└── need-human.mp3  # Son quand Claude attend
```

### Etape 2: Configurer les hooks

Ajouter dans `settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -c \"Add-Type -AssemblyName presentationCore; $p = New-Object System.Windows.Media.MediaPlayer; $p.Volume = 0.1; $p.Open('C:\\Users\\VOTRE_USER\\.claude\\song\\finish.mp3'); $p.Play(); Start-Sleep -Seconds 2\""
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -c \"Add-Type -AssemblyName presentationCore; $p = New-Object System.Windows.Media.MediaPlayer; $p.Volume = 0.1; $p.Open('C:\\Users\\VOTRE_USER\\.claude\\song\\need-human.mp3'); $p.Play(); Start-Sleep -Seconds 2\""
          }
        ]
      }
    ]
  }
}
```

> **Note**: Voir `song/README.md` pour plus de détails sur les fichiers audio.

## Aliases Bash (Optionnel)

Ajouter dans `~/.bashrc`:

```bash
# Claude Code shortcuts (full permissions)
alias cc='claude --dangerously-skip-permissions'
alias ccc='claude --continue --dangerously-skip-permissions'
alias ccr='claude --resume --dangerously-skip-permissions'
```

Puis recharger:
```bash
source ~/.bashrc
```

| Alias | Description |
|-------|-------------|
| `cc` | Lance Claude Code (full perms) |
| `ccc` | Continue dernière conversation |
| `ccr` | Choisir une conversation à reprendre |

## Structure des fichiers

```
~/.claude/
├── settings.json              # Config Claude Code
├── song/                      # Fichiers audio (COPIER ICI)
│   ├── finish.mp3
│   └── need-human.mp3
└── scripts/
    └── statusline/
        ├── README.md
        ├── package.json
        ├── settings.example.json  # Config à copier
        ├── bashrc.example         # Aliases à copier
        ├── src/
        │   ├── statusline-windows.ts
        │   └── commands/
        │       ├── spend-today-win.ts
        │       └── spend-month-win.ts
        ├── song/                  # Sons d'exemple
        │   ├── README.md
        │   └── *.mp3              # A copier vers ~/.claude/song/
        └── data/                  # Auto-généré
            ├── spend.json
            └── period-cost.json
```

## Données stockées

### `data/spend.json`
Historique de toutes les sessions avec coût, durée et date.

### `data/period-cost.json`
Suivi du coût de la période 5h en cours.

## Dépannage

### La statusline ne s'affiche pas

1. Vérifier que bun est installé: `bun --version`
2. Vérifier le chemin dans settings.json
3. Tester manuellement:
```bash
echo '{"session_id":"test","transcript_path":"","cwd":"C:/test","model":{"id":"sonnet","display_name":"Sonnet"},"workspace":{"current_dir":"C:/test","project_dir":"C:/test"},"version":"2.0","cost":{"total_cost_usd":0.10,"total_duration_ms":60000}}' | bun ~/.claude/scripts/statusline/src/statusline-windows.ts
```

### Les sons ne fonctionnent pas

1. Vérifier que les fichiers MP3 existent
2. Tester la commande PowerShell manuellement
3. Ajuster le volume (0.1 = 10%)

## Licence

MIT

## Auteur

Créé avec Claude Code
