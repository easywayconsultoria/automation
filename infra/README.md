# Fundação GCP

Projeto alvo: `easy-way-consultoria-aduaneira`. Estes comandos preparam APIs e identidade; revise IAM antes de executar. Não há chave JSON no fluxo recomendado.

```bash
gcloud config set project easy-way-consultoria-aduaneira
./infra/gcp/bootstrap.sh
./infra/gcp/bootstrap.sh --apply
```

Sem `--apply`, o script apenas mostra o plano e não altera recursos. Com `--apply`, ele exige que o projeto ativo do `gcloud` corresponda exatamente ao projeto esperado, habilita Secret Manager, IAM Credentials, Cloud Logging, Cloud Storage e Document AI e cria (se ausente) a service account `easyway-app`. Ele não concede papéis. Para Vercel, prefira Workload Identity Federation; documente e aprove cada binding de principal externo antes de adicioná-lo. Como alternativa temporária, uma chave JSON deve existir apenas como secret cifrado na Vercel, com rotação e prazo de remoção.

Padrão de secrets: `easyway-<ambiente>-<servico>-<finalidade>`, por exemplo `easyway-prod-supabase-database-url`. Nunca salve valores em Git ou imagens Docker.

Papéis devem ser mínimos e por recurso: `roles/secretmanager.secretAccessor` em secrets específicos, `roles/storage.objectUser` no bucket aplicável e papéis específicos do Document AI Processor. Evite `Editor` e `Owner` para workloads.
