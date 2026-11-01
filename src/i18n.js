// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, alarm and noise states, event titles,
// widget contents, statuses, toasts, scene texts. Vocabulary of the Gladys
// interface (appareil / Gerät / dispositivo); German says "du", Spanish
// "usted". Home and sensor names given in the Minut app are never translated.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices and features
  sensorName: { en: 'Minut {name}', fr: 'Minut {name}', de: 'Minut {name}', es: 'Minut {name}' },
  homeName: {
    en: 'Minut home {name}',
    fr: 'Maison Minut {name}',
    de: 'Minut-Zuhause {name}',
    es: 'Hogar Minut {name}',
  },
  featureTemperature: {
    en: 'Temperature',
    fr: 'Température',
    de: 'Temperatur',
    es: 'Temperatura',
  },
  featureHumidity: { en: 'Humidity', fr: 'Humidité', de: 'Luftfeuchtigkeit', es: 'Humedad' },
  featureSound: {
    en: 'Sound level',
    fr: 'Niveau sonore',
    de: 'Geräuschpegel',
    es: 'Nivel de sonido',
  },
  featurePressure: {
    en: 'Atmospheric pressure',
    fr: 'Pression atmosphérique',
    de: 'Luftdruck',
    es: 'Presión atmosférica',
  },
  featureBattery: { en: 'Battery', fr: 'Pile', de: 'Batterie', es: 'Batería' },
  featureTamper: {
    en: 'Removed from its plate',
    fr: 'Décroché de son support',
    de: 'Von der Halterung genommen',
    es: 'Retirado de su soporte',
  },
  featureAlarm: { en: 'Alarm', fr: 'Alarme', de: 'Alarm', es: 'Alarma' },
  featureAlarmStatus: {
    en: 'Alarm status',
    fr: 'État de l’alarme',
    de: 'Alarmstatus',
    es: 'Estado de la alarma',
  },
  featureNoiseMonitoring: {
    en: 'Noise monitoring',
    fr: 'Surveillance du bruit',
    de: 'Lärmüberwachung',
    es: 'Vigilancia del ruido',
  },
  featureDisturbance: {
    en: 'Noise disturbance',
    fr: 'Perturbation sonore',
    de: 'Lärmstörung',
    es: 'Molestia por ruido',
  },

  // alarm states (alarm_status of the API)
  alarm_on: { en: 'On', fr: 'Activée', de: 'Ein', es: 'Activada' },
  alarm_off: { en: 'Off', fr: 'Désactivée', de: 'Aus', es: 'Desactivada' },
  alarm_on_grace_period: {
    en: 'Turning on',
    fr: 'En cours d’activation',
    de: 'Wird eingeschaltet',
    es: 'Activándose',
  },
  alarm_off_grace_period: {
    en: 'Grace period',
    fr: 'Délai de grâce',
    de: 'Karenzzeit',
    es: 'Periodo de gracia',
  },
  alarm_critical_event: {
    en: 'Alarm triggered',
    fr: 'Alarme déclenchée',
    de: 'Alarm ausgelöst',
    es: 'Alarma disparada',
  },

  // noise monitoring states (disturbance_monitoring.state of the API)
  noise_idle: { en: 'Quiet', fr: 'Calme', de: 'Ruhig', es: 'Tranquilo' },
  noise_level_1: {
    en: 'Alert level 1',
    fr: 'Alerte niveau 1',
    de: 'Warnstufe 1',
    es: 'Alerta nivel 1',
  },
  noise_level_2: {
    en: 'Alert level 2',
    fr: 'Alerte niveau 2',
    de: 'Warnstufe 2',
    es: 'Alerta nivel 2',
  },
  noise_level_3: {
    en: 'Alert level 3',
    fr: 'Alerte niveau 3',
    de: 'Warnstufe 3',
    es: 'Alerta nivel 3',
  },
  noise_level_4: {
    en: 'Alert level 4',
    fr: 'Alerte niveau 4',
    de: 'Warnstufe 4',
    es: 'Alerta nivel 4',
  },
  noise_response_service_dispatched: {
    en: 'Guard dispatched',
    fr: 'Agent envoyé',
    de: 'Wachdienst geschickt',
    es: 'Agente enviado',
  },
  noise_snoozed: { en: 'Paused', fr: 'En pause', de: 'Pausiert', es: 'En pausa' },
  noise_inactive: { en: 'Off', fr: 'Désactivée', de: 'Aus', es: 'Desactivada' },

  // event titles (home event types of the API, and the alarm switched outside Gladys)
  event_noise_detected: {
    en: 'Noise detected',
    fr: 'Bruit détecté',
    de: 'Lärm erkannt',
    es: 'Ruido detectado',
  },
  event_noise_quieted: {
    en: 'Noise back to normal',
    fr: 'Bruit revenu à la normale',
    de: 'Lärm wieder normal',
    es: 'Ruido de nuevo normal',
  },
  event_alarm_heard: {
    en: 'Smoke or CO alarm heard',
    fr: 'Alarme incendie ou CO entendue',
    de: 'Rauch- oder CO-Alarm gehört',
    es: 'Alarma de humo o CO oída',
  },
  event_alarm_grace_period_expired: {
    en: 'Security alarm triggered',
    fr: 'Alarme de sécurité déclenchée',
    de: 'Sicherheitsalarm ausgelöst',
    es: 'Alarma de seguridad disparada',
  },
  event_alarm_silenced: {
    en: 'Alarm silenced',
    fr: 'Alarme réduite au silence',
    de: 'Alarm stummgeschaltet',
    es: 'Alarma silenciada',
  },
  event_alarm_muted_button_press: {
    en: 'Alarm muted on the sensor',
    fr: 'Alarme coupée sur le capteur',
    de: 'Alarm am Sensor stummgeschaltet',
    es: 'Alarma silenciada en el sensor',
  },
  event_alarm_turned_on: {
    en: 'Alarm turned on',
    fr: 'Alarme activée',
    de: 'Alarm eingeschaltet',
    es: 'Alarma activada',
  },
  event_alarm_turned_off: {
    en: 'Alarm turned off',
    fr: 'Alarme désactivée',
    de: 'Alarm ausgeschaltet',
    es: 'Alarma desactivada',
  },
  event_tamper: {
    en: 'Sensor taken off or put back',
    fr: 'Capteur décroché ou raccroché',
    de: 'Sensor abgenommen oder angebracht',
    es: 'Sensor retirado o colocado',
  },
  event_tamper_removed: {
    en: 'Sensor removed from its plate',
    fr: 'Capteur décroché de son support',
    de: 'Sensor von der Halterung genommen',
    es: 'Sensor retirado de su soporte',
  },
  event_tamper_mounted: {
    en: 'Sensor put back on its plate',
    fr: 'Capteur remis sur son support',
    de: 'Sensor wieder angebracht',
    es: 'Sensor colocado en su soporte',
  },
  event_casing_tamper_detected: {
    en: 'Sensor casing opened',
    fr: 'Boîtier du capteur ouvert',
    de: 'Sensorgehäuse geöffnet',
    es: 'Carcasa del sensor abierta',
  },
  event_device_offline: {
    en: 'Sensor offline',
    fr: 'Capteur hors ligne',
    de: 'Sensor offline',
    es: 'Sensor desconectado',
  },
  event_device_online: {
    en: 'Sensor back online',
    fr: 'Capteur de nouveau en ligne',
    de: 'Sensor wieder online',
    es: 'Sensor conectado de nuevo',
  },
  event_battery_low: {
    en: 'Battery low',
    fr: 'Pile faible',
    de: 'Batterie schwach',
    es: 'Batería baja',
  },
  event_battery_empty: {
    en: 'Battery empty',
    fr: 'Pile vide',
    de: 'Batterie leer',
    es: 'Batería agotada',
  },
  event_temperature_high: {
    en: 'Temperature too high',
    fr: 'Température trop élevée',
    de: 'Temperatur zu hoch',
    es: 'Temperatura demasiado alta',
  },
  event_temperature_low: {
    en: 'Temperature too low',
    fr: 'Température trop basse',
    de: 'Temperatur zu niedrig',
    es: 'Temperatura demasiado baja',
  },
  event_temperature_dropped_normal: {
    en: 'Temperature back to normal',
    fr: 'Température revenue à la normale',
    de: 'Temperatur wieder normal',
    es: 'Temperatura de nuevo normal',
  },
  event_temperature_risen_normal: {
    en: 'Temperature back to normal',
    fr: 'Température revenue à la normale',
    de: 'Temperatur wieder normal',
    es: 'Temperatura de nuevo normal',
  },
  event_almost_freezing: {
    en: 'Almost freezing',
    fr: 'Risque de gel',
    de: 'Fast Frost',
    es: 'Casi bajo cero',
  },
  event_humidity_high: {
    en: 'Humidity too high',
    fr: 'Humidité trop élevée',
    de: 'Luftfeuchtigkeit zu hoch',
    es: 'Humedad demasiado alta',
  },
  event_humidity_low: {
    en: 'Humidity too low',
    fr: 'Humidité trop basse',
    de: 'Luftfeuchtigkeit zu niedrig',
    es: 'Humedad demasiado baja',
  },
  event_humidity_dropped_normal: {
    en: 'Humidity back to normal',
    fr: 'Humidité revenue à la normale',
    de: 'Luftfeuchtigkeit wieder normal',
    es: 'Humedad de nuevo normal',
  },
  event_humidity_risen_normal: {
    en: 'Humidity back to normal',
    fr: 'Humidité revenue à la normale',
    de: 'Luftfeuchtigkeit wieder normal',
    es: 'Humedad de nuevo normal',
  },
  event_risk_of_mould: {
    en: 'Risk of mould',
    fr: 'Risque de moisissure',
    de: 'Schimmelgefahr',
    es: 'Riesgo de moho',
  },
  event_risk_of_mould_cleared: {
    en: 'Mould risk over',
    fr: 'Fin du risque de moisissure',
    de: 'Schimmelgefahr vorbei',
    es: 'Fin del riesgo de moho',
  },
  event_short_button_press: {
    en: 'Sensor button pressed',
    fr: 'Bouton du capteur pressé',
    de: 'Sensortaste gedrückt',
    es: 'Botón del sensor pulsado',
  },
  event_smoking_detected: {
    en: 'Smoking detected',
    fr: 'Tabagisme détecté',
    de: 'Rauchen erkannt',
    es: 'Se detectó que se fuma',
  },
  event_crowd_detected: {
    en: 'Crowd detected',
    fr: 'Affluence détectée',
    de: 'Menschenmenge erkannt',
    es: 'Aglomeración detectada',
  },
  event_other: {
    en: 'Minut event',
    fr: 'Événement Minut',
    de: 'Minut-Ereignis',
    es: 'Evento de Minut',
  },

  // card badges of the events widget
  badge_noise: { en: 'Noise', fr: 'Bruit', de: 'Lärm', es: 'Ruido' },
  badge_alarm: { en: 'Alarm', fr: 'Alarme', de: 'Alarm', es: 'Alarma' },
  badge_sensor: { en: 'Sensor', fr: 'Capteur', de: 'Sensor', es: 'Sensor' },
  badge_climate: { en: 'Climate', fr: 'Climat', de: 'Klima', es: 'Clima' },
  badge_battery: { en: 'Battery', fr: 'Pile', de: 'Batterie', es: 'Batería' },
  badge_home: { en: 'Home', fr: 'Logement', de: 'Zuhause', es: 'Hogar' },

  // widgets
  updatedAt: { en: 'at {time}', fr: 'à {time}', de: 'um {time}', es: 'a las {time}' },
  statusAlarm: { en: 'Alarm', fr: 'Alarme', de: 'Alarm', es: 'Alarma' },
  statusNoise: { en: 'Noise', fr: 'Bruit', de: 'Lärm', es: 'Ruido' },
  statusSensors: { en: 'Sensors', fr: 'Capteurs', de: 'Sensoren', es: 'Sensores' },
  statusBattery: {
    en: 'Lowest battery',
    fr: 'Pile la plus faible',
    de: 'Schwächste Batterie',
    es: 'Batería más baja',
  },
  sensorsOnline: {
    en: '{online} online',
    fr: '{online} en ligne',
    de: '{online} online',
    es: '{online} conectados',
  },
  sensorsSomeOffline: {
    en: '{online} online, {offline} offline',
    fr: '{online} en ligne, {offline} hors ligne',
    de: '{online} online, {offline} offline',
    es: '{online} conectados, {offline} sin conexión',
  },
  tileTemperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  tileHumidity: { en: 'Humidity', fr: 'Humidité', de: 'Feuchtigkeit', es: 'Humedad' },
  tileSound: { en: 'Sound level', fr: 'Niveau sonore', de: 'Geräuschpegel', es: 'Nivel sonoro' },
  buttonAlarmOn: {
    en: 'Turn alarm on',
    fr: 'Activer l’alarme',
    de: 'Alarm einschalten',
    es: 'Activar la alarma',
  },
  buttonAlarmOff: {
    en: 'Turn alarm off',
    fr: 'Désactiver l’alarme',
    de: 'Alarm ausschalten',
    es: 'Desactivar la alarma',
  },
  buttonSilence: {
    en: 'Silence alarm',
    fr: 'Faire taire l’alarme',
    de: 'Alarm stummschalten',
    es: 'Silenciar la alarma',
  },
  buttonNoisePause: {
    en: 'Pause noise alerts',
    fr: 'Pause alertes bruit',
    de: 'Lärmalarme pausieren',
    es: 'Pausar alertas ruido',
  },
  buttonNoiseResume: {
    en: 'Resume noise alerts',
    fr: 'Reprendre alertes bruit',
    de: 'Lärmalarme fortsetzen',
    es: 'Reanudar alertas ruido',
  },
  rowNow: { en: 'Last hour', fr: 'Dernière heure', de: 'Letzte Stunde', es: 'Última hora' },
  rowAverage: { en: 'Average', fr: 'Moyenne', de: 'Mittelwert', es: 'Promedio' },
  rowPeak: { en: 'Loudest', fr: 'Le plus fort', de: 'Am lautesten', es: 'Más alto' },
  seriesAverage: {
    en: 'Hourly average',
    fr: 'Moyenne horaire',
    de: 'Stundenmittel',
    es: 'Media horaria',
  },
  seriesPeak: { en: 'Hourly peak', fr: 'Pic horaire', de: 'Stundenspitze', es: 'Pico horario' },
  soundHeading: {
    en: '{name} · sound over 24 h',
    fr: '{name} · son sur 24 h',
    de: '{name} · Lärm über 24 Std.',
    es: '{name} · sonido en 24 h',
  },
  eventsHeading: {
    en: '{name} · events',
    fr: '{name} · événements',
    de: '{name} · Ereignisse',
    es: '{name} · eventos',
  },
  noHome: {
    en: 'No Minut home yet. Check the client id and secret in the configuration of the integration.',
    fr: 'Aucune maison Minut pour l’instant. Vérifiez l’identifiant et le secret du client dans la configuration de l’intégration.',
    de: 'Noch kein Minut-Zuhause. Prüfe die Client-ID und das Secret in der Konfiguration der Integration.',
    es: 'Todavía no hay ningún hogar Minut. Compruebe el id y el secreto del cliente en la configuración de la integración.',
  },
  noSensor: {
    en: 'No Minut sensor yet. Check the configuration of the integration.',
    fr: 'Aucun capteur Minut pour l’instant. Vérifiez la configuration de l’intégration.',
    de: 'Noch kein Minut-Sensor. Prüfe die Konfiguration der Integration.',
    es: 'Todavía no hay ningún sensor Minut. Compruebe la configuración de la integración.',
  },
  noEvents: {
    en: 'No event since the integration started. Minut events show here within a minute or two.',
    fr: 'Aucun événement depuis le démarrage de l’intégration. Les événements Minut s’affichent ici en une à deux minutes.',
    de: 'Kein Ereignis seit dem Start der Integration. Minut-Ereignisse erscheinen hier nach ein bis zwei Minuten.',
    es: 'Ningún evento desde que se inició la integración. Los eventos de Minut aparecen aquí en uno o dos minutos.',
  },
  noHistory: {
    en: 'No sound level yet: the sensor reports about once an hour.',
    fr: 'Pas encore de niveau sonore : le capteur transmet environ une fois par heure.',
    de: 'Noch kein Geräuschpegel: Der Sensor meldet sich etwa einmal pro Stunde.',
    es: 'Todavía no hay nivel sonoro: el sensor informa aproximadamente una vez por hora.',
  },
  sensorOfflineText: {
    en: 'Offline since {time}.',
    fr: 'Hors ligne depuis {time}.',
    de: 'Offline seit {time}.',
    es: 'Sin conexión desde las {time}.',
  },

  // toasts and action results
  toastAlarmOn: {
    en: 'Alarm of {name} turned on.',
    fr: 'Alarme de {name} activée.',
    de: 'Alarm von {name} eingeschaltet.',
    es: 'Alarma de {name} activada.',
  },
  toastAlarmOff: {
    en: 'Alarm of {name} turned off.',
    fr: 'Alarme de {name} désactivée.',
    de: 'Alarm von {name} ausgeschaltet.',
    es: 'Alarma de {name} desactivada.',
  },
  toastSilenced: {
    en: 'Alarm of {name} silenced.',
    fr: 'Alarme de {name} réduite au silence.',
    de: 'Alarm von {name} stummgeschaltet.',
    es: 'Alarma de {name} silenciada.',
  },
  toastNoisePaused: {
    en: 'Noise alerts of {name} paused for {minutes} min.',
    fr: 'Alertes bruit de {name} en pause pour {minutes} min.',
    de: 'Lärmalarme von {name} für {minutes} Min. pausiert.',
    es: 'Alertas de ruido de {name} en pausa durante {minutes} min.',
  },
  toastNoiseResumed: {
    en: 'Noise alerts of {name} resumed.',
    fr: 'Alertes bruit de {name} reprises.',
    de: 'Lärmalarme von {name} fortgesetzt.',
    es: 'Alertas de ruido de {name} reanudadas.',
  },
  testDone: {
    en: 'Connected to Minut. Organizations: {organizations}. Homes: {homes}. Sensors: {devices}. Open the Discover tab to add them.',
    fr: 'Connecté à Minut. Organisations : {organizations}. Maisons : {homes}. Capteurs : {devices}. Ouvrez l’onglet Découverte pour les ajouter.',
    de: 'Mit Minut verbunden. Organisationen: {organizations}. Zuhause: {homes}. Sensoren: {devices}. Öffne den Tab Entdecken, um sie hinzuzufügen.',
    es: 'Conectado a Minut. Organizaciones: {organizations}. Hogares: {homes}. Sensores: {devices}. Abra la pestaña Descubrir para añadirlos.',
  },
  diagnosticDone: {
    en: 'Diagnostic written to the logs of the integration ({count} line(s)).',
    fr: 'Diagnostic écrit dans les journaux de l’intégration ({count} ligne(s)).',
    de: 'Diagnose in die Logs der Integration geschrieben ({count} Zeile(n)).',
    es: 'Diagnóstico escrito en los registros de la integración ({count} línea(s)).',
  },

  // connection status and errors
  statusConnected: {
    en: 'Connected to Minut. Homes: {homes}. Sensors: {devices}.',
    fr: 'Connecté à Minut. Maisons : {homes}. Capteurs : {devices}.',
    de: 'Mit Minut verbunden. Zuhause: {homes}. Sensoren: {devices}.',
    es: 'Conectado a Minut. Hogares: {homes}. Sensores: {devices}.',
  },
  statusPaused: {
    en: 'Minut asked to slow down (too many requests): the integration waits {minutes} min.',
    fr: 'Minut demande de ralentir (trop de requêtes) : l’intégration attend {minutes} min.',
    de: 'Minut bittet um weniger Anfragen: Die Integration wartet {minutes} Min.',
    es: 'Minut pide reducir el ritmo (demasiadas solicitudes): la integración espera {minutes} min.',
  },
  errNoCredentials: {
    en: 'Enter the client id and secret of your Minut API client (web.minut.com, Settings, Developer tools).',
    fr: 'Saisissez l’identifiant et le secret de votre client d’API Minut (web.minut.com, Settings, Developer tools).',
    de: 'Gib die Client-ID und das Secret deines Minut-API-Clients ein (web.minut.com, Settings, Developer tools).',
    es: 'Introduzca el id y el secreto de su cliente de la API de Minut (web.minut.com, Settings, Developer tools).',
  },
  errAuth: {
    en: 'Minut refused the client id or secret: check them in the configuration.',
    fr: 'Minut a refusé l’identifiant ou le secret du client : vérifiez-les dans la configuration.',
    de: 'Minut hat die Client-ID oder das Secret abgelehnt: Prüfe sie in der Konfiguration.',
    es: 'Minut rechazó el id o el secreto del cliente: compruébelos en la configuración.',
  },
  errForbidden: {
    en: 'Minut refused access ({detail}). API access needs a Minut plan that includes it.',
    fr: 'Minut a refusé l’accès ({detail}). L’accès à l’API demande une offre Minut qui l’inclut.',
    de: 'Minut hat den Zugriff verweigert ({detail}). Der API-Zugang braucht einen Minut-Tarif, der ihn enthält.',
    es: 'Minut denegó el acceso ({detail}). El acceso a la API requiere un plan de Minut que lo incluya.',
  },
  errNoOrganization: {
    en: 'Connected, but Minut gives no organization for this client: API access may not be enabled on the account.',
    fr: 'Connecté, mais Minut ne donne aucune organisation pour ce client : l’accès à l’API n’est peut-être pas activé sur le compte.',
    de: 'Verbunden, aber Minut liefert keine Organisation für diesen Client: Der API-Zugang ist im Konto vielleicht nicht aktiviert.',
    es: 'Conectado, pero Minut no devuelve ninguna organización para este cliente: puede que el acceso a la API no esté activado en la cuenta.',
  },
  errRateLimit: {
    en: 'Minut asked to slow down: try again in a few minutes.',
    fr: 'Minut demande de ralentir : réessayez dans quelques minutes.',
    de: 'Minut bittet um weniger Anfragen: Versuch es in ein paar Minuten noch einmal.',
    es: 'Minut pide reducir el ritmo: inténtelo de nuevo en unos minutos.',
  },
  errUnreachable: {
    en: 'Minut cannot be reached ({detail}).',
    fr: 'Minut est injoignable ({detail}).',
    de: 'Minut ist nicht erreichbar ({detail}).',
    es: 'No se puede contactar con Minut ({detail}).',
  },
  errFailed: {
    en: 'Minut answered with an error ({detail}).',
    fr: 'Minut a répondu par une erreur ({detail}).',
    de: 'Minut hat mit einem Fehler geantwortet ({detail}).',
    es: 'Minut respondió con un error ({detail}).',
  },
  errMotionDisabled: {
    en: 'The alarm cannot be turned on: motion detection is turned off for this Minut organization.',
    fr: 'L’alarme ne peut pas être activée : la détection de mouvement est désactivée pour cette organisation Minut.',
    de: 'Der Alarm kann nicht eingeschaltet werden: Die Bewegungserkennung ist für diese Minut-Organisation aus.',
    es: 'No se puede activar la alarma: la detección de movimiento está desactivada para esta organización de Minut.',
  },
  errNoiseNotEnabled: {
    en: 'Noise monitoring is not turned on for this home in Minut.',
    fr: 'La surveillance du bruit n’est pas activée pour cette maison dans Minut.',
    de: 'Die Lärmüberwachung ist für dieses Zuhause in Minut nicht eingeschaltet.',
    es: 'La vigilancia del ruido no está activada para este hogar en Minut.',
  },
  errNoAlarm: {
    en: 'This Minut home has no security alarm.',
    fr: 'Cette maison Minut n’a pas d’alarme de sécurité.',
    de: 'Dieses Minut-Zuhause hat keinen Sicherheitsalarm.',
    es: 'Este hogar Minut no tiene alarma de seguridad.',
  },

  // scene action summary
  summaryHome: {
    en: '{home}: alarm {alarm}, noise {noise}.',
    fr: '{home} : alarme {alarm}, bruit {noise}.',
    de: '{home}: Alarm {alarm}, Lärm {noise}.',
    es: '{home}: alarma {alarm}, ruido {noise}.',
  },
  summaryClimate: {
    en: '{temperature} °C, {humidity} % humidity.',
    fr: '{temperature} °C, {humidity} % d’humidité.',
    de: '{temperature} °C, {humidity} % Luftfeuchtigkeit.',
    es: '{temperature} °C, {humidity} % de humedad.',
  },
  summaryOffline: {
    en: 'Sensors offline: {count}.',
    fr: 'Capteurs hors ligne : {count}.',
    de: 'Sensoren offline: {count}.',
    es: 'Sensores sin conexión: {count}.',
  },
};

/**
 * @description Whether a value is one of the four languages.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language, its placeholders filled.
 * @param {string} key - A TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The placeholder values.
 * @returns {string} The text.
 * @example
 * t('toastAlarmOn', 'fr', { name: 'Chalet' }); // 'Alarme de Chalet activée.'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string} key - A TEXTS key.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description A text in the four languages, from a function of the language.
 * @param {Function} write - `(language) => string`.
 * @returns {object} `{ en, fr, de, es }`.
 */
const allOf = (write) =>
  Object.fromEntries(LANGUAGES.map((language) => [language, write(language)]));

/**
 * @description The name of an alarm state.
 * @param {string|null} status - `alarm_status` of the API.
 * @param {string} language - The language.
 * @returns {string} The name, '' when unknown.
 */
const alarmText = (status, language) =>
  status && TEXTS[`alarm_${status}`] ? t(`alarm_${status}`, language) : '';

/**
 * @description The name of a noise monitoring state.
 * @param {string|null} state - `disturbance_monitoring.state`, or `inactive`.
 * @param {string} language - The language.
 * @returns {string} The name, '' when unknown.
 */
const noiseText = (state, language) =>
  state && TEXTS[`noise_${state}`] ? t(`noise_${state}`, language) : '';

/**
 * @description A decimal written the way of a language: "21,5" in French.
 * @param {number} value - The value.
 * @param {string} language - The language.
 * @param {number} [digits] - Fraction digits at most.
 * @returns {string} The text.
 */
const decimal = (value, language, digits = 1) =>
  new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);

export { LANGUAGES, TEXTS, isLanguage, t, all, allOf, alarmText, noiseText, decimal };
