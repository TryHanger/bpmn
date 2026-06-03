ACT_APP - таблица с для работы движка flowabel (при использовании App Engine)

act_app_appdef - пусто
act_app_databasechangelog - хэш сборки
act_app_databasechangeloglock - пусто
act_app_deployment - пусто
act_app_deployment_resource - пусто

-----

ACT_CMMN - таблицы для CMMN Engine
CMMN - используется для моделирования гибких бизнес процессов, где условия и порядок может часто меняться

ПРИМЕР:
    Case: Hiring Candidate

    Доступные действия:

    □ Провести интервью
    □ Назначить техническое интервью
    □ Проверить рекомендации
    □ Отправить тестовое
    □ Запросить дополнительные документы
    □ Сделать оффер
    □ Отказать

    Логика:

    Если позиция = Senior
        → открыть "Проверить рекомендации"

    Если интервью плохое
        → открыть "Отказать"

    Если интервью хорошее
        → открыть "Сделать оффер"

    Если не хватает документов
        → открыть "Запросить документы"

act_cmmn_casedef
act_cmmn_databasechangelog
act_cmmn_databasechangeloglock
act_cmmn_deployment
act_cmmn_hi_case_inst
act_cmmn_hi_mil_inst
act_cmmn_hi_plan_item_inst
act_cmmn_ru_case_inst
act_cmmn_ru_mil_inst
act_cmmn_ru_plan_item_inst
act_cmmn_ru_sentry_part_inst

act_co_content_item
act_co_databasechangelog
act_co_databasechangeloglock