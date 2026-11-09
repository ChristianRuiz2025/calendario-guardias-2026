-- Usuario de MySQL para la app (Lambda) con lo minimo: solo datos (sin DDL) y solo en la BD guardias.
-- Lo corre un usuario administrador de la RDS (con CREATE USER y GRANT OPTION).
-- La contrasena es la de MYSQL_PASSWORD en el secreto calendario-guardias/stage/app;
-- reemplazar <CONTRASENA> y NO guardar el archivo con la contrasena en el repo.
-- Compatible con MySQL 5.7.

CREATE USER IF NOT EXISTS 'guardias_app'@'%' IDENTIFIED BY '<CONTRASENA>' REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE, DELETE ON guardias.* TO 'guardias_app'@'%';
FLUSH PRIVILEGES;

-- Verificacion:
-- SHOW GRANTS FOR 'guardias_app'@'%';
