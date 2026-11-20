-- Reference price schedule: AUD uplift paid for the CC split of an AR-DRG (v11) vs its base split
-- ((cc NWAU - base NWAU) x national efficient price). Demo constants; an insurer holds this schedule.
CREATE OR REFRESH MATERIALIZED VIEW drg_price_delta
COMMENT 'AR-DRG v11 CC-split price uplift (AUD) used to value DRG upcoding recoveries.'
TBLPROPERTIES ('quality' = 'silver')
AS SELECT drg_cc, drg_base, CAST(uplift_aud AS DECIMAL(10, 2)) AS uplift_aud
FROM VALUES
  ('I04A', 'I04B', 13299.93),
  ('I03A', 'I03B', 13999.86),
  ('G07A', 'G07B', 4200.21),
  ('H08A', 'H08B', 4900.14),
  ('F06A', 'F06B', 5040.00),
  ('I06A', 'I06B', 5040.00),
  ('L62A', 'L62B', 5040.00)
AS t(drg_cc, drg_base, uplift_aud);
