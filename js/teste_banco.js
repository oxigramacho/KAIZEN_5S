app.post('/ocorrencias', async (req, res) => {
  const { data_ocorrencia, data_auditoria, colaborador_id, setor_id, lider_id, turno_id, itens } = req.body;

  if (!data_ocorrencia) {
    return res.status(400).json({ erro: 'A data da ocorrência é obrigatória.' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Insere a ocorrência (fallback para ID 1 caso algum ID venha nulo/indefinido)
    const [result] = await connection.query(
      `INSERT INTO ocorrencias 
       (data_ocorrencia, data_auditoria, colaborador_id, setor_id, lider_id, turno_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data_ocorrencia, 
        data_auditoria || data_ocorrencia, 
        colaborador_id || 1, 
        setor_id || 1, 
        lider_id || 1, 
        turno_id || 1
      ]
    );

    const ocorrenciaId = result.insertId;

    // 2. Insere os itens de auditoria
    if (itens && itens.length > 0) {
      const valoresItens = itens.map(item => [
        ocorrenciaId, 
        item.senso || 'Seiso', 
        item.descricao || 'Sem descrição', 
        item.valor_desconto !== undefined ? item.valor_desconto : (item.valor || 0.00)
      ]);

      await connection.query(
        'INSERT INTO ocorrencias_itens (ocorrencia_id, senso, descricao, valor_desconto) VALUES ?',
        [valoresItens]
      );
    }

    await connection.commit();
    res.status(201).json({ mensagem: 'Auditoria salva com sucesso!', ocorrencia_id: ocorrenciaId });

  } catch (error) {
    await connection.rollback();
    res.status(500).json({ erro: error.message });
  } finally {
    connection.release();
  }
});