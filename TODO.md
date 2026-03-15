# TODO — TranslateFlow IA

## 🔴 Blocker — CI / GitHub Actions

- [ ] **Hablar con AWS Admin** para que agreguen `AmazonBedrockFullAccess` al rol/usuario de CI
  - Error actual: `Felix.Zelaya is not authorized to perform: bedrock:InvokeModel`
  - Secrets necesarios en GitHub: `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`

---

## 🟡 Mejoras al Pipeline

### Glosario Persistente
- [ ] Crear `pipeline/context/glossary.json` — archivo versionado en git con terminología corporativa
- [ ] Crear `pipeline/context/build-glossary.js` — script que lee TODOS los `translated/` y genera el glosario
- [ ] Agregar comando `npm run pipeline:build-glossary`
- [ ] Actualizar `context-builder.js` para leer el glosario persistente en lugar de regenerarlo cada vez
- [ ] Permitir edición manual del glosario para agregar términos corporativos específicos (nombres de features, productos internos, etc.)

### Limpieza del Proyecto
- [ ] Eliminar archivos de MVPs anteriores que no pertenecen a la nueva estructura:
  - `original-old-projects/`
  - `scripts/` (legacy — trabajaban con `languages/`, no con `origin/`/`translated/`)
  - `src/translateflow-tool/` (MCP server del pipeline anterior)
  - `languages/` (solo contiene fake-acd-1 y fake-acd-2 demo files)
  - `.github/workflows/actions.yml` (workflow legacy)
  - `.github/workflows/actions-test.txt`

---

## 🟢 Ideas Futuras

### MCP Server para el Glosario
- [ ] Crear un MCP tool `translation-context-tool` que exponga el glosario
  - Permitiría consultar traducciones desde Claude Code interactivamente
  - Ejemplo: "¿cómo se traduce 'Skill Assignment' al japonés?"
  - Podría integrarse con el pipeline para enriquecer el contexto en tiempo real

### Referencia de Archivos en Contexto
- [ ] **Idea pendiente de desarrollar** — referenciar archivos del proyecto directamente
  en el contexto de traducción (a trabajar)

### Otras Mejoras
- [ ] Soporte para agregar nuevos idiomas automáticamente (crear carpeta en `translated/` y el pipeline lo detecta)
- [ ] Dashboard o reporte HTML de las traducciones generadas
- [ ] Notificación (Slack/email) cuando el pipeline completa o falla en CI
