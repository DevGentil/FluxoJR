// `server-only` existe para o build do Next quebrar quando um módulo de
// servidor é importado por um Client Component. Em teste esse marcador não
// tem o que fazer, e o pacote nem resolve fora do bundler — então o alias
// do vitest aponta para este arquivo vazio. Trocar por não usar
// `server-only` seria abrir mão da proteção no build por causa do teste.
export {};
