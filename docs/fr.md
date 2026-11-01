# Minut

## Présentation

[Minut](https://www.minut.com) fabrique des capteurs de logement sur piles, utilisés dans les locations saisonnières, les appartements et les maisons : ils surveillent le **bruit** sans enregistrer aucun son, la **température**, l’**humidité**, la **pression**, reconnaissent le son d’une **alarme incendie ou CO**, et servent d’**alarme de sécurité** avec détection de mouvement. Chaque capteur transmet au cloud Minut environ une fois par heure, et tout de suite quand il se passe quelque chose.

Cette intégration les amène dans Gladys par l’[API officielle de Minut](https://developer.minut.com) : un appareil par capteur et un par maison, l’alarme et les alertes bruit pilotées depuis Gladys, des déclencheurs de scène sur les événements que Minut signale, des actions de scène et trois widgets de tableau de bord.

**Important** : Minut n’ouvre son API qu’aux comptes de son offre **Enterprise** ; sinon, le site de Minut propose de « book a demo ». L’intégration a été écrite d’après la référence officielle de l’API et n’a jamais été testée avec un vrai compte Minut : dites-nous ce que vous observez.

## Prérequis

- Gladys Assistant **5.3.0** ou plus récent (mots-clés du catalogue). Les instances plus anciennes ne peuvent pas installer l’intégration.
- Des capteurs Minut installés dans l’appli Minut, sur un compte avec accès à l’API (offre Minut Enterprise).
- Un client d’API Minut (ci-dessous).

### Créer le client d’API

1. Connectez-vous à l’[appli web Minut](https://web.minut.com) avec le compte de vos maisons.
2. Ouvrez **Settings**, puis **Developer tools** ([web.minut.com/settings/api-clients](https://web.minut.com/settings/api-clients)), et créez un client d’API. Aucune adresse de redirection n’est nécessaire : l’intégration utilise le type `client_credentials`, pour vos propres données.
3. Copiez son **identifiant** (client id) et son **secret** (client secret).

Si la page Developer tools n’existe pas, ou si le client n’obtient aucune organisation, l’accès à l’API n’est pas activé sur le compte : contactez Minut.

## Configuration

| Champ                             | Que saisir                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Identifiant du client             | L’identifiant de votre client d’API Minut.                                                                               |
| Secret du client                  | Son secret. Enregistré comme secret, jamais réaffiché ni journalisé.                                                     |
| Pause des alertes bruit (minutes) | Durée de la pause quand vous coupez la surveillance du bruit (un « snooze » Minut), de 5 à 1 440 minutes. 60 par défaut. |
| Langue des textes                 | Noms des appareils et textes donnés aux scènes. Automatique : la langue du dernier widget affiché.                       |

Deux boutons complètent l’écran : **Connecter et rechercher** (vérifie le client, liste vos maisons et capteurs et les propose dans l’onglet Découverte) et **Diagnostic** (l’état de l’intégration dans ses journaux, sans le secret).

## Utilisation

### Appareils

Ouvrez l’onglet **Découverte** de l’intégration et créez les appareils :

- **Maison Minut …**, une par maison : **Alarme** (un interrupteur : activée ou désactivée), **État de l’alarme** (activée, désactivée, en cours d’activation, délai de grâce, alarme déclenchée), **Surveillance du bruit** (un interrupteur : alertes bruit actives, ou en pause pour la durée réglée dans la configuration) et **Perturbation sonore** (calme, alerte niveau 1 à 4, en pause, désactivée). L’alarme apparaît quand Minut donne son état, la surveillance du bruit quand elle est activée dans Minut.
- **Minut …**, un par capteur, nommé comme dans l’appli Minut : **Température** (°C), **Humidité** (%), **Niveau sonore** (dB, pondéré A par Minut), **Pression atmosphérique** (hPa), **Pile** (%) et **Décroché de son support** (1 quand le capteur est hors de son support ; capteurs récents seulement), chacune dès que Minut a donné sa valeur.

Une fonctionnalité proposée ne disparaît jamais ; une valeur que Minut n’a pas donnée garde la précédente. Il n’y a pas de fonctionnalité « en ligne » : utilisez le déclencheur **capteur hors ligne ou de retour**. Le mouvement ne fait pas partie des événements de maison de l’API et n’est pas disponible.

Les capteurs Minut transmettent environ une fois par heure : l’intégration les lit à leur prochaine transmission prévue (entre 5 et 60 minutes), les maisons toutes les 5 minutes et les événements chaque minute, toujours sous la limite de requêtes de l’API (100 requêtes par minute au plus, Minut en autorise 120).

### Widgets du tableau de bord

![Le widget Maison Minut avec l’alarme, le bruit, les capteurs et les boutons d’alarme, le widget Événements Minut avec les derniers événements de la maison, et le widget Son Minut sur 24 h (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-minut/main/docs/assets/widgets.fr.png)

- **Maison Minut** : l’alarme, la surveillance du bruit, les capteurs en ligne et hors ligne, la pile la plus faible, puis la température et l’humidité moyennes et le niveau sonore le plus fort ; des boutons pour activer ou désactiver l’alarme (avec confirmation), la faire taire quand elle sonne, et suspendre ou reprendre les alertes bruit.
- **Événements Minut** : les 8 derniers événements d’une maison (bruit, alarmes, capteurs, climat, pile), du plus récent au plus ancien.
- **Son Minut sur 24 h** : la moyenne et le pic horaires du niveau sonore d’un capteur, avec la dernière heure, la moyenne et l’heure la plus bruyante.

Les deux premiers ont un réglage **Maison Minut**, le troisième un réglage **Capteur** (le premier par défaut).

### Scènes

Déclencheurs (filtres : maison, capteur et état ; variables : `home_name`, `device_name`, `state`, `event_type`, `event_time`, `time`, `title`, et les identifiants dans Gladys) :

- **Minut : perturbation sonore** : `started` (bruit au-dessus du seuil de la surveillance du bruit) ou `ended`. Aussi `sound_level`, `sound_threshold`, `noise_count`.
- **Minut : alarme incendie ou CO entendue** : un capteur reconnaît le son d’un détecteur.
- **Minut : alarme de sécurité** : `triggered` (après un mouvement, une fois le délai de grâce écoulé), `silenced`, `muted` sur un capteur.
- **Minut : alarme activée ou désactivée** : `on` ou `off`, changée hors de Gladys (appli Minut, programmation). Une commande de Gladys ne le déclenche jamais.
- **Minut : capteur décroché** : `removed`, `mounted`, `moved` (anciens capteurs), `casing` (boîtier ouvert).
- **Minut : capteur hors ligne ou de retour** : `offline`, `online`.
- **Minut : pile faible** : `low` (environ deux semaines restantes), `empty`.
- **Minut : alerte de température** : `high`, `low`, `normal`, `freezing` — sur les seuils réglés dans Minut.
- **Minut : alerte d’humidité** : `high`, `low`, `normal`.
- **Minut : risque de moisissure** : `detected`, `cleared`.
- **Minut : bouton du capteur pressé**, **Minut : tabagisme détecté**, **Minut : affluence détectée**.

Les événements arrivent dans Gladys en une à deux minutes. Seuls les événements postérieurs au premier démarrage comptent, chacun une seule fois.

Actions :

- **Minut : activer ou désactiver l’alarme** (maison, activée / désactivée).
- **Minut : faire taire l’alarme** (maison).
- **Minut : suspendre ou reprendre les alertes bruit** (maison, suspendre / reprendre, minutes).
- **Minut : lire l’état d’une maison** : alarme, bruit, capteurs en ligne et hors ligne, température et humidité moyennes, niveau sonore le plus fort, pile la plus faible, et une phrase toute prête `summary`.

Aucune ne déclenche de déclencheur. Exemples :

- Quand **une perturbation sonore commence** → envoyer `Bruit à {{triggerEvent.data.home_name}} : {{triggerEvent.data.sound_level}} dBA` à l’hôte ; quand elle **se termine** → une courte confirmation.
- Quand **une alarme incendie ou CO est entendue** → toutes les lumières allumées, et une notification.
- Quand **la maison se vide** → **activer l’alarme Minut** ; au retour de quelqu’un → la désactiver.

### Transport

Cloud (`"transports": ["cloud"]`) : l’intégration contacte `api.minut.com` en HTTPS avec un jeton OAuth2 de votre client ; Minut détient déjà ce que vos capteurs transmettent. Les webhooks ne sont pas utilisés (ils demandent une adresse HTTPS publique) : l’intégration lit les événements à la place. Les derniers états, les fonctionnalités de chaque appareil et les événements déjà déclenchés sont gardés dans le volume `/data` de l’intégration : un redémarrage ne déclenche rien deux fois.

## Dépannage

- **Minut a refusé l’identifiant ou le secret du client** : recopiez-les depuis la page Developer tools, puis enregistrez la configuration.
- **Minut ne donne aucune organisation pour ce client**, ou **Minut a refusé l’accès** : l’accès à l’API n’est pas activé sur le compte (offre Enterprise) ; contactez Minut.
- **Minut demande de ralentir** : l’intégration se met en pause d’elle-même, puis reprend ; rien à faire.
- **L’alarme ne peut pas être activée : la détection de mouvement est désactivée** : le mouvement et la présence sont désactivés pour l’organisation dans Minut.
- **La surveillance du bruit n’est pas activée pour cette maison** : activez-la d’abord dans l’appli Minut.
- **Les valeurs ne changent qu’environ une fois par heure** : c’est le rythme des capteurs ; les événements, eux, arrivent tout de suite.
- **Toujours bloqué** : appuyez sur **Diagnostic**, puis ouvrez une issue sur [GitHub](https://github.com/William-De71/gladys-minut/issues) avec les versions de Gladys et de l’intégration, votre offre Minut, et les lignes « Minut diagnostic » des journaux (ajoutez `DEBUG=gladys-integration-sdk` en mode développeur).

Minut est une marque de son propriétaire. Cette intégration communautaire n’est pas affiliée à Minut.
