http://localhost:8080/flowable-rest/service/history/historic-process-instances GET

superProcessInstanceId - показывает родительский процесс, нужно для отрисовки всех под процессов.
businessKey - идентификатор процесса в внешней системе (бд)
startTime - время начала процесса
endTime - время конца процесса
durationInMillis - время выполнения процесса
deleteReason - причина удаления процесса


http://localhost:8080/flowable-rest/service/history/historic-process-instances?superProcessInstanceId=762c579d-5445-11f1-b224-d2ad2a8d8500 GET

К примеру мы начали с нашего основного айди, получили все процессы дочерние, теперь нужно каждый их id отправить те же запросы и получить еще дочерние процессы. Таким образом пока не останется superProcessInstanceId. Каждый полученный процесс сохраняем.


У каждого процесса мы получаем xml_template с бд по businessKey


http://localhost:8080/flowable-rest/service/history/historic-variable-instances?processInstanceId=2439e11c-5447-11f1-b224-d2ad2a8d8500

Получаем все переменные процесса по processInstanceId, хранятся только текущие (последние сохраненные)


http://localhost:8080/flowable-rest/service/history/historic-activity-instances?processInstanceId=20aa51cc-550b-11f1-b224-d2ad2a8d8500&start=0&size=100

Получаем историю активности процесса, а также желательно в ручную выставлять большой size для получения точно всей истории
