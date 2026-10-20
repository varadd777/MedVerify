
pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                echo 'Checking out MedVerify source code'
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                bat 'npm install'
            }
        }

        stage('Build and Test') {
            steps {
                bat 'npm run build'
            }
        }

        stage('Build Docker Image') {
            steps {
                bat 'docker build -t jashk185/medverify:latest .'
            }
        }

        


stage('Push Image to Docker Hub') {
    steps {
        withCredentials([
            usernamePassword(
                credentialsId: 'dockerhub-creds',
                usernameVariable: 'DOCKER_USER',
                passwordVariable: 'DOCKER_PASS'
            )
        ]) {
            powershell '''
                $ErrorActionPreference = "Stop"
                $dockerConfig = Join-Path $env:TEMP ("jenkins-docker-" + [guid]::NewGuid())
                New-Item -ItemType Directory -Path $dockerConfig | Out-Null
                $env:DOCKER_CONFIG = $dockerConfig

                try {
                    $env:DOCKER_PASS | docker login --username $env:DOCKER_USER --password-stdin
                    if ($LASTEXITCODE -ne 0) {
                        exit $LASTEXITCODE
                    }
                }
                finally {
                    Remove-Item -Recurse -Force $dockerConfig -ErrorAction SilentlyContinue
                }
            '''

            bat 'docker push jashk185/medverify:latest'
        }
    }
}

    }
}

