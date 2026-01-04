# Sons de notification

Ce dossier contient les fichiers audio pour les hooks Claude Code.

## Installation

**IMPORTANT**: Les fichiers MP3 doivent être copiés à la racine de Claude:

```
~/.claude/song/
├── finish.mp3      # Son quand Claude termine une tâche
└── need-human.mp3  # Son quand Claude attend une réponse
```

### Commande pour copier:

```bash
# Depuis Git Bash
cp ~/.claude/scripts/statusline/song/*.mp3 ~/.claude/song/
```

Ou manuellement:
```
C:\Users\VOTRE_USER\.claude\song\
```

## Fichiers requis

| Fichier | Hook | Description |
|---------|------|-------------|
| `finish.mp3` | Stop | Joué quand Claude termine |
| `need-human.mp3` | Notification | Joué quand Claude attend |

## Recommandations

- **Durée**: 1-3 secondes max
- **Volume**: Les sons seront joués à 10% du volume
- **Format**: MP3 (compatible Windows MediaPlayer)

## Sons suggérés

Vous pouvez utiliser des sons de:
- [Freesound.org](https://freesound.org)
- [Mixkit.co](https://mixkit.co/free-sound-effects/)
- Notifications système Windows
