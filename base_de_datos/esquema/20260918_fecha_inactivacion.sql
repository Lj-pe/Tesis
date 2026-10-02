USE boutique_libreria_bazar_alanis;

ALTER TABLE categorias
    ADD COLUMN fecha_inactivacion DATETIME NULL AFTER estado;

ALTER TABLE productos
    ADD COLUMN fecha_inactivacion DATETIME NULL AFTER estado;