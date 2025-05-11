<?php
echo json_encode(['ping'=>true]);
exit;

// api/api.php
header('Content-Type: application/json; charset=utf-8');

try {
    $db = new PDO(
        "mysql:host=localhost;dbname=boxing;charset=utf8",
        "boxing",
        "#boxing1205",
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Erreur de connexion DB']);
    exit;
}

$action = $_GET['action'] ?? '';
$input  = json_decode(file_get_contents('php://input'), true);

switch ($action) {

    // 1) AUTH ADMIN
    case 'login':
        $stmt = $db->prepare("SELECT 1 FROM admins WHERE username = ? AND password = ?");
        $stmt->execute([$input['id'], $input['pwd']]);
        echo json_encode(['success' => (bool)$stmt->fetchColumn()]);
        exit;

    // 2) ADD
    case 'add':
        $stmt = $db->prepare("
            INSERT INTO entrees (nom, prenom, type, entreprise, combat)
            VALUES (:nom, :prenom, :type, :entreprise, :combat)
        ");
        $combat = !empty($input['combat']) ? 1 : 0;
        $ok = $stmt->execute([
            ':nom'        => $input['nom'],
            ':prenom'     => $input['prenom'],
            ':type'       => $input['type'],
            ':entreprise' => $input['entreprise'] ?? '',
            ':combat'     => $combat
        ]);
        echo json_encode(['success' => (bool)$ok]);
        exit;

    // 3) UPDATE
    case 'update':
        $stmt = $db->prepare("
            UPDATE entrees
               SET nom        = :nom,
                   prenom     = :prenom,
                   type       = :type,
                   entreprise = :entreprise,
                   combat     = :combat
             WHERE id = :id
        ");
        $combat = !empty($input['combat']) ? 1 : 0;
        $ok = $stmt->execute([
            ':nom'        => $input['nom'],
            ':prenom'     => $input['prenom'],
            ':type'       => $input['type'],
            ':entreprise' => $input['entreprise'] ?? '',
            ':combat'     => $combat,
            ':id'         => $input['id']
        ]);
        echo json_encode(['success' => (bool)$ok]);
        exit;

    // 4) DELETE
    case 'delete':
        $stmt = $db->prepare("DELETE FROM entrees WHERE id = ?");
        $ok = $stmt->execute([$input['id']]);
        echo json_encode(['success' => (bool)$ok]);
        exit;

    // 5) LIST
    case 'list':
        $rows = $db
            ->query("SELECT id, nom, prenom, type, entreprise, combat
                       FROM entrees
                   ORDER BY id DESC")
            ->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($rows);
        exit;

    // 6) TOURNOI
    case 'setupTournament':
        $db->exec("TRUNCATE TABLE tournament_matches");
        $ids = $db->query("SELECT id FROM entrees WHERE combat = 1 ORDER BY id")
                  ->fetchAll(PDO::FETCH_COLUMN);
        // Remplir jusqu’à la puissance de 2
        $n0 = count($ids);
        $p2 = 1 << ceil(log(max($n0,1),2));
        while (count($ids) < $p2) $ids[] = null;
        $ins = $db->prepare("
            INSERT INTO tournament_matches
              (round, match_index, player1_id, player2_id)
            VALUES
              (1, :m, :p1, :p2)
        ");
        foreach (array_chunk($ids, 2) as $i => $pair) {
            $ins->execute([':m'=>$i,':p1'=>$pair[0],':p2'=>$pair[1]]);
        }
        echo json_encode(['success' => true]);
        exit;

    case 'getTournament':
        $rows = $db->query("
            SELECT round, match_index, player1_id, player2_id, winner_id
              FROM tournament_matches
             ORDER BY round, match_index
        ")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($rows);
        exit;

    case 'updateMatch':
        $r = intval($input['round']);
        $m = intval($input['match_index']);
        $w = isset($input['winner_id']) ? intval($input['winner_id']) : null;
        $upd = $db->prepare("
            UPDATE tournament_matches
               SET winner_id = :w
             WHERE round = :r AND match_index = :m
        ");
        $ok = $upd->execute([':w'=>$w,':r'=>$r,':m'=>$m]);
        // Génération du tour suivant si tous terminés...
        $cnt = $db->prepare("
            SELECT COUNT(*) AS total,
                   SUM(winner_id IS NOT NULL) AS done
              FROM tournament_matches
             WHERE round = :r
        ");
        $cnt->execute([':r'=>$r]);
        $t = $cnt->fetch(PDO::FETCH_ASSOC);
        if ($t['total'] == $t['done']) {
            $winStmt = $db->prepare("
                SELECT winner_id FROM tournament_matches
                 WHERE round = :r ORDER BY match_index
            ");
            $winStmt->execute([':r'=>$r]);
            $winners = $winStmt->fetchAll(PDO::FETCH_COLUMN);
            if (count($winners) % 2 === 1) $winners[] = null;
            $ins2 = $db->prepare("
                INSERT INTO tournament_matches
                  (round, match_index, player1_id, player2_id)
                VALUES (:nr, :m, :p1, :p2)
            ");
            foreach (array_chunk($winners, 2) as $i=>$pair) {
                $chk = $db->prepare("
                    SELECT 1 FROM tournament_matches
                     WHERE round = :nr AND match_index = :m
                ");
                $chk->execute([':nr'=>$r+1,':m'=>$i]);
                if (!$chk->fetchColumn()) {
                    $ins2->execute([
                      ':nr'=>$r+1,':m'=>$i,
                      ':p1'=>$pair[0],':p2'=>$pair[1]
                    ]);
                }
            }
        }
        echo json_encode(['success'=>(bool)$ok]);
        exit;

    // Action invalide
    default:
        http_response_code(400);
        echo json_encode(['success'=>false,'message'=>'Action invalide']);
        exit;
}
