-- Joué une seule fois au premier démarrage de la DB (quand le volume est vide).
-- Active pg_trgm pour la recherche de similarité utilisée par
-- l'auto-catégorisation des transactions (similarity(...)).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
