# Finanzas

App personal de finanzas multi-moneda (UYU / USD): movimientos, tarjetas y compras
en cuotas, presupuestos y proyección a 6 meses.

## Stack

- React 18 + TypeScript
- Vite (dev server y build)
- Tailwind CSS (estilos utilitarios)
- Recharts (gráficos de proyección)
- Vitest (tests unitarios de la lógica de plata y proyección)

## Requisitos

- Node.js 18 o superior ([nodejs.org](https://nodejs.org))
- Un editor (VS Code recomendado)

## Puesta en marcha local

```bash
# 1. Instalar dependencias
npm install

# 2. Levantar el servidor de desarrollo
npm run dev
```

> Si ya tenías el proyecto instalado y actualizaste el código con el módulo
> de Cuentas, corré `npm install` de nuevo — se agregó la dependencia `xlsx`
> para el export a Excel.

Abrí http://localhost:5173 — se recarga solo al guardar cambios.

Otros comandos:

```bash
npm run build     # build de producción en /dist
npm run preview   # sirve el build de producción localmente
npm run test      # corre los tests una vez
npm run test:watch # corre los tests en modo watch
npm run lint      # chequeo de ESLint
```

## Subir esto a GitHub

Desde la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Primer commit: app de finanzas"
```

Después, en GitHub, creá un repositorio nuevo (vacío, sin README ni .gitignore,
para que no choque con lo que ya tenés) y corré los comandos que GitHub te
muestra en la página, algo como:

```bash
git remote add origin https://github.com/TU_USUARIO/finanzas-app.git
git branch -M main
git push -u origin main
```

En VS Code podés hacer lo mismo desde la pestaña de "Source Control" (ícono de
rama en la barra lateral) sin usar la terminal, si preferís.

## Arquitectura

```
src/
  types.ts              tipos de dominio (Transaction, Card, Installment, Budget)
  lib/
    money.ts            conversión y formato de montos (enteros, sin floats)
    dates.ts            helpers de fechas y claves de mes (YYYY-MM)
    storage.ts           capa de persistencia (patrón Repository) + migraciones de esquema
    projection.ts        lógica de proyección a N meses
    accounts.ts           cálculo de saldo de cuentas
    excelExport.ts         export a Excel por banco (usa SheetJS/xlsx)
    permissions.ts          helpers de ver/editar según el usuario activo
    *.test.ts             tests de la lógica sensible (plata, proyección, saldos, migraciones, permisos)
  components/ui.tsx      componentes de UI compartidos (Modal, Input, etc.)
  styles/theme.ts         paleta de colores central
  features/
    dashboard/            resumen del mes
    transactions/          movimientos (alta, edición, listado, asignación a cuenta)
    accounts/               bancos, cajas por moneda y export a Excel
    cards/                 tarjetas y compras en cuotas
    budgets/                presupuestos por categoría
    projection/             gráficos de proyección
    settings/                categorías administrables + usuarios y permisos
  App.tsx                 orquesta navegación, estado, permisos y modales

## Módulo de Configuración (usuarios, permisos y categorías)

**Importante: esto es organización de la interfaz, no seguridad.** No hay
backend ni contraseña — cualquiera con acceso al navegador ve los mismos
datos, sin importar qué perfil esté activo. Sirve para que distintas personas
que comparten la app (ej. vos y tu socia) vean y toquen solo lo que les
corresponde, evitando errores por descuido. Si en algún momento necesitás
separar datos de gente que no debería verlos entre sí, hace falta backend +
autenticación real (ver roadmap más abajo).

- **Perfil activo**: se elige desde el botón con el nombre de usuario, arriba
  a la izquierda, o desde Configuración → Usuarios y permisos.
- **Permisos por módulo**: cada usuario tiene, por cada pestaña, un permiso de
  "Ver" y uno de "Editar" (editar implica ver). Si no tiene "Ver" un módulo,
  esa pestaña directamente no aparece en la navegación.
- **Categorías**: se administran desde Configuración → Categorías. No se
  puede borrar una categoría que ya está en uso en algún movimiento o
  presupuesto — hay que reasignar esos registros primero.
```

### Por qué está separado así

- **`lib/` no importa nada de React.** Es lógica pura (plata, fechas,
  proyección), así se puede testear sin levantar un componente y reutilizar
  si el día de mañana hacés una versión mobile o un endpoint de backend con
  la misma lógica.
- **`storage.ts` usa el patrón Repository.** Hoy `LocalStorageRepository`
  guarda todo en el navegador. El resto de la app solo conoce la interfaz
  `FinanceRepository` (`load`/`save`), no el detalle de dónde vive el dato.
  Cuando quieras un backend real, se agrega una clase nueva
  (`ApiRepository`) y se cambia una sola línea en `getRepository()`.
- **Los montos se guardan como enteros ("unidades mínimas", como los
  centésimos).** Nunca se opera con decimales de punto flotante para plata,
  para evitar errores de redondeo acumulados.

## Roadmap de escalabilidad (en orden sugerido)

1. **Exportar / importar datos.** Hoy todo vive en `localStorage` de un solo
   navegador: si borrás datos del navegador, se pierde todo. Un botón de
   "Exportar a JSON" / "Importar" es la red de seguridad más barata y rápida
   de agregar.
2. **Backend real cuando necesites multi-dispositivo.** Opciones típicas:
   - Supabase o Firebase (autenticación + base de datos ya resueltas, rápido
     para un proyecto personal).
   - Un backend propio (Node + Express/Fastify + SQLite o Postgres) si
     preferís tener control total.
   En cualquier caso, solo se toca `storage.ts`: se crea `ApiRepository`
   implementando `load`/`save` contra la API, y `App.tsx` no cambia.
3. **Autenticación**, si vas a tener más de un usuario o querés acceder desde
   el celular y la computadora con los mismos datos.
4. **Migraciones de esquema.** Ya está el enganche en `storage.ts`
   (`migrate()` y `schemaVersion`) — cuando cambies la forma de los datos,
   sumá un caso ahí en vez de romper los datos de usuarios existentes.
5. **Más tests** a medida que crezca la lógica de negocio (por ejemplo, si
   agregás conversión de moneda con tipo de cambio, o recurrencias
   automáticas de ingresos/gastos).

## Categorías

Las categorías de ingresos y gastos están hardcodeadas en `src/types.ts`
(`EXPENSE_CATEGORIES`, `INCOME_CATEGORIES`). Si querés que el usuario pueda
crear categorías propias, ese es un buen próximo paso: pasarían de ser una
constante a una entidad más en `FinanceData`, con su propio CRUD.
