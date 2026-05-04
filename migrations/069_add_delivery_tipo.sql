-- Migration 69: Add tipo column to inventory_delivery_requests
--
-- Eliminates the [TIPO:entrega] hack stored in notes.
-- tipo = 'entrega' | 'venda'

ALTER TABLE inventory_delivery_requests
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'entrega'
  CHECK (tipo IN ('entrega', 'venda'));
