const express = require('express');
const cors = require('cors');
const db = require('./db'); // Importa a conexão com o banco

const app = express();
app.use(express.json());
app.use(cors());

// 1. Rota para buscar os setores cadastrados no banco
app.get('/setores', async (req, res) => {
    try {
        const [setores] = await db.query('SELECT id, nome FROM setores');
        res.json(setores);
    } catch (error) {
        console.error("Erro ao buscar setores:", error);
        res.status(500).json({ erro: error.message });
    }
});

// 2. Rota para buscar os líderes cadastrados no banco
app.get('/lideres', async (req, res) => {
    try {
        const [lideres] = await db.query('SELECT id, nome FROM lideres');
        res.json(lideres);
    } catch (error) {
        console.error("Erro ao buscar líderes:", error);
        res.status(500).json({ erro: error.message });
    }
});

// 3. Rota para salvar ocorrências/auditorias (Suporta diário, quinzenal e mensal)
app.post('/ocorrencias', async (req, res) => {
    const { nome_auditor, setor_id, lider_id, turno_id, tipo_formulario, itens } = req.body;

    if (!nome_auditor || !setor_id || !lider_id || !turno_id || !itens || itens.length === 0) {
        return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios e selecione ao menos um item.' });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        let colaborador_id = 1;
        if (nome_auditor && nome_auditor.trim() !== "") {
            let [colab] = await connection.query('SELECT id FROM colaboradores WHERE nome = ?', [nome_auditor.trim()]);
            
            if (colab.length > 0) {
                colaborador_id = colab[0].id;
            } else {
                const [novoColab] = await connection.query(
                    'INSERT INTO colaboradores (nome, setor_id) VALUES (?, ?)', 
                    [nome_auditor.trim(), setor_id || 1]
                );
                colaborador_id = novoColab.insertId;
            }
        }

        let total_desconto = 0;
        if (itens && itens.length > 0) {
            itens.forEach(item => {
                total_desconto += parseFloat(item.valor_desconto || 0);
            });
        }

        let nota_final = Math.max(0, 10 - total_desconto);
        const dataHoje = new Date().toISOString().split('T')[0];

        const [result] = await connection.query(
            `INSERT INTO ocorrencias 
                (data_auditoria, tipo_formulario, nota_final, total_desconto, colaborador_id, setor_id, lider_id, turno_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [dataHoje, tipo_formulario || 'diario', nota_final, total_desconto, colaborador_id, setor_id || 1, lider_id || 1, turno_id || 1]
        );

        const ocorrenciaId = result.insertId;

        if (itens && itens.length > 0) {
            const valoresItens = itens.map(item => [
                ocorrenciaId, 
                item.senso || 'Seiso (Limpeza)', 
                item.descricao || 'Sem descrição', 
                item.valor_desconto || 0.00
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
        console.error("Erro ao salvar:", error);
        res.status(500).json({ erro: error.message });
    } finally {
        connection.release();
    }
});

// 4. Rota do Gráfico
app.get('/api/dados-grafico', async (req, res) => {
    try {
        const query = `
            SELECT 
                o.data_auditoria,
                s.nome AS setor,
                o.nota_final,
                o.turno_id
            FROM ocorrencias o
            LEFT JOIN setores s ON o.setor_id = s.id
            ORDER BY o.data_auditoria ASC;
        `;
        const [resultados] = await db.query(query);
        res.json(resultados);
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// 5. Rota da Tabela Geral
app.get('/api/ocorrencias-detalhadas', async (req, res) => {
    try {
        const query = `
            SELECT 
                o.id,
                o.data_auditoria,
                o.tipo_formulario,
                o.turno_id,
                s.nome AS setor,
                l.nome AS lider,
                c.nome AS auditor,
                o.total_desconto,
                o.nota_final
            FROM ocorrencias o
            LEFT JOIN setores s ON o.setor_id = s.id
            LEFT JOIN lideres l ON o.lider_id = l.id
            LEFT JOIN colaboradores c ON o.colaborador_id = c.id
            ORDER BY o.data_auditoria DESC;
        `;
        const [resultados] = await db.query(query);
        res.json(resultados);
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// 6. Rota para o Gráfico de Descontos por Senso
app.get('/api/dados-senso', async (req, res) => {
    try {
        const query = `
            SELECT 
                i.senso, 
                i.valor_desconto,
                o.data_auditoria,
                o.turno_id
            FROM ocorrencias_itens i
            JOIN ocorrencias o ON i.ocorrencia_id = o.id;
        `;
        const [resultados] = await db.query(query);
        res.json(resultados);
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// 7. Rota para o Ranking de Turnos com mais descontos
app.get('/api/ranking-turnos', async (req, res) => {
    try {
        const query = `
            SELECT 
                o.turno_id,
                SUM(COALESCE(o.total_desconto, 0)) AS total_desconto,
                COUNT(o.id) AS total_auditorias
            FROM ocorrencias o
            GROUP BY o.turno_id
            ORDER BY total_desconto DESC;
        `;
        const [resultados] = await db.query(query);
        res.json(resultados);
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// 8. Rota para o Relatório Final de Desempenho e Meta
app.get('/api/relatorio-final', async (req, res) => {
    try {
        const query = `
            SELECT 
                COUNT(o.id) AS total_auditorias,
                AVG(COALESCE(o.nota_final, 0)) AS media_nota_final,
                SUM(COALESCE(o.total_desconto, 0)) AS soma_descontos
            FROM ocorrencias o;
        `;
        const [resultado] = await db.query(query);
        const dados = resultado[0];

        const mediaNota = parseFloat(dados.media_nota_final || 0);
        const indiceDesempenho = mediaNota * 10; 
        const atingiuMeta = indiceDesempenho >= 95;

        res.json({
            total_auditorias: dados.total_auditorias,
            media_nota: mediaNota.toFixed(2),
            indice_desempenho: indiceDesempenho.toFixed(1) + '%',
            meta_estabelecida: '95%',
            status_meta: atingiuMeta ? 'META ATINGIDA 🎯' : 'ABAIXO DA META ⚠️'
        });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// Inicialização Única do Servidor
app.get('/', (req, res) => {
  res.send('API do Kaizen 5S rodando com sucesso!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});