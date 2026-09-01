const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/ocorrencias', async (req, res) => {
  const { data_ocorrencia, setor_id, lider_id, turno_id, itens } = req.body;

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      'INSERT INTO ocorrencias (data_ocorrencia, setor_id, lider_id, turno_id) VALUES (?, ?, ?, ?)',
      [data_ocorrencia, setor_id, lider_id, turno_id]
    );

    const ocorrenciaId = result.insertId;

    if (itens && itens.length > 0) {
      const valoresItens = itens.map(item => [ocorrenciaId, item.descricao, item.valor]);
      await connection.query(
        'INSERT INTO ocorrencias_itens (ocorrencia_id, descricao, valor) VALUES ?',
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

app.listen(3000, () => {
  console.log('🚀 Servidor de teste ativo na porta 3000');
});