USE boutique_libreria_bazar_alanis;

ALTER TABLE compras
    DROP COLUMN impuesto;

ALTER TABLE detalle_compras
    DROP COLUMN impuesto;

ALTER TABLE ventas
    DROP COLUMN impuesto;

ALTER TABLE detalle_ventas
    DROP COLUMN impuesto;
